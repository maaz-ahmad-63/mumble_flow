import assert from 'assert';
import http from 'http';
import { authService } from '../server/services/authService.js';
import { storage } from '../server/services/storageService.js';
import { userRepository } from '../server/db/repositories/userRepository.js';
import { sqliteAdapter } from '../server/db/sqliteAdapter.js';
import { app } from '../server/index.js';

export async function runPhase1SaasTests() {
  console.log('2️⃣4️⃣ Testing Phase 1: SaaS Foundation, Multi-User Auth & Admin Panel Suite...');

  // Initialize DB if not already initialized
  sqliteAdapter.initialize();

  // Start test HTTP server on an ephemeral free port
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Ensure default_user exists and has admin role
    const defaultUser = userRepository.findById('default_user');
    assert.ok(defaultUser, 'default_user should exist');
    assert.strictEqual(defaultUser.role, 'admin', 'default_user should be admin');

    // ==========================================
    // Test 1: Registration Input Validation
    // ==========================================
    console.log('   1. Registration Input Validation...');
    // Invalid email format
    let invalidEmailThrew = false;
    try {
      await authService.register({ email: 'not-an-email', password: 'ValidPassword123!', name: 'Bad Email' });
    } catch (err) {
      invalidEmailThrew = true;
      assert.ok(err.message.includes('valid email address'), 'Error should indicate invalid email');
    }
    assert.ok(invalidEmailThrew, 'Registering with invalid email must throw');

    // Short password (< 8 chars)
    let shortPasswordThrew = false;
    try {
      await authService.register({ email: 'short@example.com', password: 'short', name: 'Short Pwd' });
    } catch (err) {
      shortPasswordThrew = true;
      assert.ok(err.message.includes('at least 8 characters'), 'Error should indicate short password');
    }
    assert.ok(shortPasswordThrew, 'Registering with short password must throw');

    // Successful Registration of User A & User B
    const timestamp = Date.now();
    const emailA = `saas_user_a_${timestamp}@example.com`;
    const emailB = `saas_user_b_${timestamp}@example.com`;
    const adminEmail = `saas_admin_${timestamp}@example.com`;

    const regA = await authService.register({
      email: emailA,
      password: 'PasswordUserA123!',
      name: 'User A'
    });
    assert.ok(regA.token, 'User A should receive token');
    assert.strictEqual(regA.user.status, 'active', 'User A status should default to active');
    assert.strictEqual(regA.user.role, 'user', 'User A role should default to user');

    // Duplicate email check
    let duplicateThrew = false;
    try {
      await authService.register({ email: emailA, password: 'AnotherPassword123!', name: 'Duplicate' });
    } catch (err) {
      duplicateThrew = true;
      assert.ok(err.message.includes('already exists'), 'Error should indicate email already exists');
    }
    assert.ok(duplicateThrew, 'Duplicate email registration must throw');
    console.log('      ✓ Input validation & uniqueness enforced.');

    // ==========================================
    // Test 2: Password Hashing (scrypt verification)
    // ==========================================
    console.log('   2. Password Hashing Security...');
    const userARecord = userRepository.findByEmail(emailA);
    assert.ok(userARecord.password_hash, 'Password hash must be stored');
    assert.ok(!userARecord.password_hash.includes('PasswordUserA123!'), 'Plaintext password must NEVER be in database');
    assert.ok(userARecord.password_hash.includes(':'), 'Hash must follow salt:key scrypt format');
    const [salt, key] = userARecord.password_hash.split(':');
    assert.strictEqual(salt.length, 32, 'Salt must be 16 bytes hex (32 characters)');
    assert.strictEqual(key.length, 128, 'Derived key must be 64 bytes hex (128 characters)');
    console.log('      ✓ Verified cryptographically secure scrypt hash format.');

    // ==========================================
    // Test 3: Login, Session Token & Expiration
    // ==========================================
    console.log('   3. User Login & Session Validation...');
    const loginA = await authService.login({ email: emailA, password: 'PasswordUserA123!' });
    assert.ok(loginA.token, 'Login should return session token');
    assert.strictEqual(loginA.user.id, regA.user.id);

    // Validate token
    const validSession = authService.validateToken(loginA.token);
    assert.ok(validSession, 'Valid token must resolve user');
    assert.strictEqual(validSession.id, regA.user.id);

    // Wrong password fails
    let wrongPwdFailed = false;
    try {
      await authService.login({ email: emailA, password: 'WrongPassword999!' });
    } catch (e) {
      wrongPwdFailed = true;
    }
    assert.ok(wrongPwdFailed, 'Wrong password must be rejected');
    console.log('      ✓ Login and session token verified.');

    // ==========================================
    // Test 4: Password Change & Invalidation of Existing Sessions
    // ==========================================
    console.log('   4. Password Change Flow & Token Invalidation...');
    // Bad current password throws
    let badCurrentFailed = false;
    try {
      await authService.changePassword(regA.user.id, {
        currentPassword: 'IncorrectCurrentPassword!',
        newPassword: 'BrandNewPassword123!'
      });
    } catch (e) {
      badCurrentFailed = true;
    }
    assert.ok(badCurrentFailed, 'Incorrect current password must throw error');

    // Successful change
    const changeRes = await authService.changePassword(regA.user.id, {
      currentPassword: 'PasswordUserA123!',
      newPassword: 'BrandNewPassword123!'
    });
    assert.strictEqual(changeRes.success, true);

    // Old session token is now invalidated
    const invalidatedSession = authService.validateToken(loginA.token);
    assert.strictEqual(invalidatedSession, null, 'Previous session must be invalidated after password change');

    // Can log in with new password
    const newLoginA = await authService.login({ email: emailA, password: 'BrandNewPassword123!' });
    assert.ok(newLoginA.token, 'New password must allow successful login');
    console.log('      ✓ Password change invalidates old sessions and verifies new password.');

    // ==========================================
    // Test 5: Account Suspension & Access Denial
    // ==========================================
    console.log('   5. Account Suspension & Token Invalidation...');
    // Suspend User A
    userRepository.update(regA.user.id, { status: 'suspended' });
    userRepository.deleteAllUserSessions(regA.user.id);

    // New login attempt must fail
    let suspendedLoginFailed = false;
    try {
      await authService.login({ email: emailA, password: 'BrandNewPassword123!' });
    } catch (e) {
      suspendedLoginFailed = true;
      assert.ok(e.message.includes('suspended'), 'Should state account is suspended');
    }
    assert.ok(suspendedLoginFailed, 'Suspended user must not be allowed to log in');

    // Existing token validation must fail even if token was somehow retained
    assert.strictEqual(authService.validateToken(newLoginA.token), null, 'Tokens of suspended user must be rejected');

    // Reactivate User A
    userRepository.update(regA.user.id, { status: 'active' });
    const reactivatedLogin = await authService.login({ email: emailA, password: 'BrandNewPassword123!' });
    assert.ok(reactivatedLogin.token, 'Reactivated user can log in');
    console.log('      ✓ Account suspension and reactivation properly enforced.');

    // ==========================================
    // Test 6: Admin vs Non-Admin Authorization
    // ==========================================
    console.log('   6. Admin Route Authorization & RBAC...');
    // Create an explicit Admin user
    const regAdmin = await authService.register({
      email: adminEmail,
      password: 'AdminPassword123!',
      name: 'Platform Admin'
    });
    // Promote to admin
    userRepository.update(regAdmin.user.id, { role: 'admin' });
    const adminLogin = await authService.login({ email: adminEmail, password: 'AdminPassword123!' });
    const adminToken = adminLogin.token;
    const userToken = reactivatedLogin.token;

    // Non-admin request to /api/admin/users
    const forbiddenRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert.strictEqual(forbiddenRes.status, 403, 'Regular user must receive 403 Forbidden for admin endpoint');
    const forbiddenBody = await forbiddenRes.json();
    assert.strictEqual(forbiddenBody.error, 'Forbidden. Administrator privileges required.');

    // Admin access to /api/admin/users
    const adminRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(adminRes.status, 200, 'Admin should receive 200 OK');
    const adminData = await adminRes.json();
    assert.ok(Array.isArray(adminData.users), 'Admin users response should include users list');
    assert.ok(adminData.pagination, 'Admin users response should include pagination metadata');

    // Ensure password_hash is NEVER exposed in the admin API
    for (const u of adminData.users) {
      assert.strictEqual(u.password_hash, undefined, 'User password_hash must never be exposed');
    }
    console.log('      ✓ Non-admin gets 403; Admin gets 200; sensitive fields concealed.');

    // ==========================================
    // Test 7: Admin User Management Endpoints
    // ==========================================
    console.log('   7. Admin User Management (Status & Role Updates)...');
    // Register User B
    const regB = await authService.register({
      email: emailB,
      password: 'PasswordUserB123!',
      name: 'User B'
    });

    // Admin suspends User B via PATCH /api/admin/users/:id/status
    const suspendRes = await fetch(`${baseUrl}/api/admin/users/${regB.user.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: 'suspended' })
    });
    assert.strictEqual(suspendRes.status, 200);
    const suspendData = await suspendRes.json();
    assert.strictEqual(suspendData.user.status, 'suspended');

    // Admin cannot suspend themselves
    const selfSuspendRes = await fetch(`${baseUrl}/api/admin/users/${regAdmin.user.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: 'suspended' })
    });
    assert.strictEqual(selfSuspendRes.status, 400);
    const selfSuspendData = await selfSuspendRes.json();
    assert.ok(selfSuspendData.error.includes('suspend their own account') || selfSuspendData.error.includes('suspend your own account'));

    // Admin promotes User B to admin via PATCH /api/admin/users/:id/role
    const promoteRes = await fetch(`${baseUrl}/api/admin/users/${regB.user.id}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ role: 'admin' })
    });
    assert.strictEqual(promoteRes.status, 200);
    const promoteData = await promoteRes.json();
    assert.strictEqual(promoteData.user.role, 'admin');

    // Admin cannot demote themselves
    const selfDemoteRes = await fetch(`${baseUrl}/api/admin/users/${regAdmin.user.id}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ role: 'user' })
    });
    assert.strictEqual(selfDemoteRes.status, 400);
    const selfDemoteData = await selfDemoteRes.json();
    assert.ok(selfDemoteData.error.includes('demote your own'));
    console.log('      ✓ Admin status/role updates and self-protection guards verified.');

    // ==========================================
    // Test 8: Admin System Stats & Platform Config Endpoints
    // ==========================================
    console.log('   8. Admin Stats & Platform Configuration...');
    const statsRes = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const statsData = await statsRes.json();
    if (statsRes.status !== 200) {
      console.error('Stats error:', statsData);
    }
    assert.strictEqual(statsRes.status, 200);
    assert.ok(statsData.users.total >= 3, 'Total users should be tracked');
    assert.ok(statsData.usage, 'Global usage statistics should be included');
    assert.strictEqual(statsData.system.status, 'healthy');

    const configRes = await fetch(`${baseUrl}/api/admin/config`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(configRes.status, 200);
    const configData = await configRes.json();
    assert.ok(configData.defaults, 'Defaults should be returned');
    assert.strictEqual(typeof configData.apiKeysConfigured.groq, 'boolean');
    assert.strictEqual(typeof configData.apiKeysConfigured.gemini, 'boolean');

    // Check that NO raw secret is leaked in config
    const rawConfigStr = JSON.stringify(configData);
    assert.ok(!rawConfigStr.includes('gsk_'), 'No Groq API keys should be leaked');
    assert.ok(!rawConfigStr.includes('AIza'), 'No Google API keys should be leaked');
    console.log('      ✓ Admin stats & sanitized platform configuration verified.');

    // ==========================================
    // Test 9: User Settings & Data Isolation
    // ==========================================
    console.log('   9. User Settings Isolation...');
    // Reactivate User B and demote back to user for testing
    userRepository.update(regB.user.id, { status: 'active', role: 'user' });
    const loginB = await authService.login({ email: emailB, password: 'PasswordUserB123!' });
    const tokenB = loginB.token;

    // Save distinct settings for User A
    storage.updateSettings({
      defaultTone: 'bullet',
      sttProvider: 'groq',
      sttModel: 'whisper-large-v3-turbo'
    }, regA.user.id);

    // Save distinct settings for User B
    storage.updateSettings({
      defaultTone: 'standup',
      sttProvider: 'gemini',
      sttModel: 'gemini-3.6-flash'
    }, regB.user.id);

    const settingsA = storage.getSettings(regA.user.id);
    const settingsB = storage.getSettings(regB.user.id);

    assert.strictEqual(settingsA.defaultTone, 'bullet', 'User A settings must be bullet');
    assert.strictEqual(settingsB.defaultTone, 'standup', 'User B settings must be standup');
    assert.strictEqual(settingsA.sttProvider, 'groq', 'User A provider must be groq');
    assert.strictEqual(settingsB.sttProvider, 'gemini', 'User B provider must be gemini');

    // Verify API endpoint /api/settings isolates by authenticated user
    const apiSettingsResA = await fetch(`${baseUrl}/api/settings`, {
      headers: { Authorization: `Bearer ${reactivatedLogin.token}` }
    });
    const apiSettingsA = await apiSettingsResA.json();
    assert.strictEqual(apiSettingsA.defaultTone, 'bullet');

    const apiSettingsResB = await fetch(`${baseUrl}/api/settings`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const apiSettingsB = await apiSettingsResB.json();
    assert.strictEqual(apiSettingsB.defaultTone, 'standup');
    console.log('      ✓ Multi-user settings are strictly isolated.');

    // ==========================================
    // Test 10: Backward Compatibility & Non-Breaking Fallback
    // ==========================================
    console.log('   10. Backward Compatibility & Non-Breaking Dictation Fallback...');
    // Unauthenticated call to /api/settings still functions gracefully
    const fallbackSettings = await fetch(`${baseUrl}/api/settings`);
    assert.strictEqual(fallbackSettings.status, 200, 'Unauthenticated local request should resolve default settings');

    // Health endpoint functions
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.strictEqual(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, 'ok');
    console.log('      ✓ Default user fallback and public endpoints intact.');

    console.log('\n   🎉 Phase 1 SaaS Foundation test suite PASSED with 100% fidelity.\n');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

// Standalone execution support
if (process.argv[1]?.endsWith('test_phase1_saas.js')) {
  runPhase1SaasTests().catch(err => {
    console.error('\n❌ Phase 1 SaaS Tests failed:', err);
    process.exit(1);
  });
}
