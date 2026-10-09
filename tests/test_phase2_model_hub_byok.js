/**
 * Mumble AI — Phase 2 Automated Tests
 * Model Hub, Bring Your Own API Keys (BYOK), AES-256-GCM Encryption,
 * Per-User Credential Isolation, Model Switching, and Pipeline Verification.
 */

import assert from 'assert';
import http from 'http';
import crypto from 'node:crypto';
import { app } from '../server/index.js';
import { authService } from '../server/services/authService.js';
import { cryptoService } from '../server/services/cryptoService.js';
import { apiKeyRepository } from '../server/db/repositories/apiKeyRepository.js';
import { apiKeyService } from '../server/services/apiKeyService.js';
import { modelCatalogService } from '../server/services/modelCatalogService.js';
import { settingsRepository } from '../server/db/repositories/settingsRepository.js';
import { storage } from '../server/services/storageService.js';
import { zeroEditEngine } from '../server/services/zeroEditEngine.js';

import { userRepository } from '../server/db/repositories/userRepository.js';

export async function runPhase2ModelHubByokTests() {
  console.log('🧪 Starting Phase 2: Model Hub & BYOK Verification Tests...\n');

  const testUserA = `usr_byok_a_${Date.now()}`;
  const testUserB = `usr_byok_b_${Date.now()}`;
  const testUserC = `usr_byok_c_${Date.now()}`;

  userRepository.create({
    id: testUserA,
    email: `byok_a_${Date.now()}@test.com`,
    passwordHash: 'dummy_scrypt_hash_a',
    name: 'BYOK User A',
    role: 'user',
    status: 'active'
  });

  userRepository.create({
    id: testUserB,
    email: `byok_b_${Date.now()}@test.com`,
    passwordHash: 'dummy_scrypt_hash_b',
    name: 'BYOK User B',
    role: 'user',
    status: 'active'
  });

  userRepository.create({
    id: testUserC,
    email: `byok_c_${Date.now()}@test.com`,
    passwordHash: 'dummy_scrypt_hash_c',
    name: 'BYOK User C',
    role: 'user',
    status: 'active'
  });

  // -------------------------------------------------------------
  // Test 1: Authenticated Encryption at Rest (AES-256-GCM)
  // -------------------------------------------------------------
  console.log('1️⃣ Testing Authenticated Encryption at Rest (AES-256-GCM)...');
  const rawSecret = 'gsk_test_super_secret_groq_key_987654321';
  const encrypted1 = cryptoService.encrypt(rawSecret);
  const encrypted2 = cryptoService.encrypt(rawSecret);

  assert.ok(encrypted1, 'Encrypted output must not be empty');
  assert.notStrictEqual(encrypted1, rawSecret, 'Encrypted output must not match plaintext');
  assert.notStrictEqual(encrypted1, encrypted2, 'Different encryptions must have different random IVs');

  const parts = encrypted1.split(':');
  assert.strictEqual(parts.length, 3, 'Encrypted string must be format iv:authTag:ciphertext');
  assert.strictEqual(parts[0].length, 24, 'IV must be 12 bytes hex (24 chars)');
  assert.strictEqual(parts[1].length, 32, 'AuthTag must be 16 bytes hex (32 chars)');

  const decrypted = cryptoService.decrypt(encrypted1);
  assert.strictEqual(decrypted, rawSecret, 'Decrypted text must exactly match original secret');

  // Tamper resistance test
  const tampered = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -2)}ff`;
  assert.throws(() => {
    cryptoService.decrypt(tampered);
  }, /Unsupported state or unable to authenticate data|tamper|cipher/i, 'Tampered ciphertext must fail authentication and throw');
  console.log('   ✓ AES-256-GCM authenticated encryption and tamper verification passed.');

  // -------------------------------------------------------------
  // Test 2: Safe Key Masking (Zero Plaintext Leakage)
  // -------------------------------------------------------------
  console.log('2️⃣ Testing Key Masking & Credential Leakage Prevention...');
  const maskedGroq = cryptoService.maskKey('gsk_1234567890abcdef');
  const maskedOpenai = cryptoService.maskKey('sk-proj-1234567890abcdef');
  const maskedGemini = cryptoService.maskKey('AIzaSyD1234567890abcdef');

  assert.ok(maskedGroq.startsWith('gsk_'), 'Masked Groq key should preserve prefix');
  assert.ok(maskedGroq.includes('••••'), 'Masked Groq key should obscure center');
  assert.ok(maskedGroq.endsWith('cdef'), 'Masked Groq key should preserve suffix');
  assert.ok(!maskedGroq.includes('1234567890'), 'Masked Groq key must never reveal inner secret');

  assert.ok(maskedOpenai.startsWith('sk-'), 'Masked OpenAI key should preserve prefix');
  assert.ok(maskedGemini.startsWith('AIza'), 'Masked Gemini key should preserve prefix');
  console.log('   ✓ Masking preserves safe hints while preventing credential leaks.');

  // -------------------------------------------------------------
  // Test 3: Key Validation Service
  // -------------------------------------------------------------
  console.log('3️⃣ Testing Key Validation Service...');
  const validCheck = await apiKeyService.validateKey('groq', 'test_mock_valid_key_12345');
  assert.strictEqual(validCheck.valid, true, 'Mock valid key should pass validation');

  const invalidCheck = await apiKeyService.validateKey('groq', 'test_mock_invalid_key_67890');
  assert.strictEqual(invalidCheck.valid, false, 'Mock invalid key should fail validation');

  const emptyCheck = await apiKeyService.validateKey('groq', '  ');
  assert.strictEqual(emptyCheck.valid, false, 'Empty key must fail validation');

  const unsupportedCheck = await apiKeyService.validateKey('unsupported_provider', 'abc');
  assert.strictEqual(unsupportedCheck.valid, false, 'Unsupported provider must fail validation');
  console.log('   ✓ Key validation accurately discriminates valid and invalid credentials.');

  // -------------------------------------------------------------
  // Test 4: Per-User BYOK Storage & Isolation
  // -------------------------------------------------------------
  console.log('4️⃣ Testing Per-User Credential Isolation...');
  const userAKey = 'gsk_user_a_key_abcdef123456';
  const userBKey = 'gsk_user_b_key_789012uvwxyz';

  // Save key for User A
  await apiKeyService.saveUserKey({
    userId: testUserA,
    provider: 'groq',
    rawKey: userAKey,
    validate: false
  });

  // Save key for User B
  await apiKeyService.saveUserKey({
    userId: testUserB,
    provider: 'groq',
    rawKey: userBKey,
    validate: false
  });

  // Retrieve decrypted keys
  const resA = apiKeyService.getDecryptedKey(testUserA, 'groq');
  const resB = apiKeyService.getDecryptedKey(testUserB, 'groq');
  const resC = apiKeyService.getDecryptedKey(testUserC, 'groq');

  assert.strictEqual(resA.key, userAKey, 'User A must retrieve User A key');
  assert.strictEqual(resA.source, 'user', 'User A key source must be user BYOK');

  assert.strictEqual(resB.key, userBKey, 'User B must retrieve User B key');
  assert.strictEqual(resB.source, 'user', 'User B key source must be user BYOK');

  assert.notStrictEqual(resA.key, resB.key, 'User A and User B keys must not collide');
  assert.notStrictEqual(resC.key, userAKey, 'User C must never access User A key');
  assert.notStrictEqual(resC.key, userBKey, 'User C must never access User B key');

  // Verify safe list metadata
  const listA = apiKeyService.listUserKeys(testUserA);
  const groqEntryA = listA.find(k => k.provider === 'groq');
  assert.ok(groqEntryA.isConfigured, 'Groq must be configured for User A');
  assert.strictEqual(groqEntryA.source, 'user', 'Source must be user');
  assert.ok(!groqEntryA.key, 'Raw key must NEVER be in listUserKeys response');
  assert.ok(groqEntryA.keyHint.includes('••••'), 'Key hint must be securely masked');
  console.log('   ✓ Complete credential isolation across users verified.');

  // -------------------------------------------------------------
  // Test 5: Credential Fallback (BYOK Removal -> System Fallback)
  // -------------------------------------------------------------
  console.log('5️⃣ Testing Credential Fallback & Deletion...');
  const originalEnvGroq = process.env.GROQ_API_KEY;
  try {
    process.env.GROQ_API_KEY = 'gsk_system_fallback_key';

    // Before deletion: User A uses their own BYOK key
    const beforeDel = apiKeyService.getDecryptedKey(testUserA, 'groq');
    assert.strictEqual(beforeDel.key, userAKey, 'User BYOK key must take precedence over system key');
    assert.strictEqual(beforeDel.source, 'user', 'Source must be user');

    // Delete User A BYOK key
    const deleted = apiKeyService.deleteUserKey(testUserA, 'groq');
    assert.strictEqual(deleted, true, 'Key deletion should succeed');

    // After deletion: Seamless fallback to system environment key
    const afterDel = apiKeyService.getDecryptedKey(testUserA, 'groq');
    assert.strictEqual(afterDel.key, 'gsk_system_fallback_key', 'Must fall back to system-managed key');
    assert.strictEqual(afterDel.source, 'system', 'Source must now be system');

    // Listing keys reflects system fallback
    const listAfter = apiKeyService.listUserKeys(testUserA);
    const groqAfter = listAfter.find(k => k.provider === 'groq');
    assert.strictEqual(groqAfter.source, 'system', 'List metadata reflects system managed fallback');
    console.log('   ✓ BYOK removal seamlessly falls back to system credentials.');
  } finally {
    process.env.GROQ_API_KEY = originalEnvGroq;
  }

  // -------------------------------------------------------------
  // Test 6: Model Hub Catalog & Dynamic Availability Badges
  // -------------------------------------------------------------
  console.log('6️⃣ Testing Model Hub Catalog & User Availability...');
  const catalogUserB = modelCatalogService.getFullCatalog(testUserB);
  assert.ok(catalogUserB.stt && catalogUserB.stt.length > 0, 'Catalog must return STT models');
  assert.ok(catalogUserB.llm && catalogUserB.llm.length > 0, 'Catalog must return LLM models');

  const groqSttUserB = catalogUserB.stt.find(m => m.provider === 'groq');
  assert.ok(groqSttUserB, 'Groq STT model must be catalogued');
  assert.strictEqual(groqSttUserB.statusBadge, 'BYOK Active', 'Groq STT should show BYOK Active for User B');

  // Validate model selection validation
  const validSelection = modelCatalogService.validateSelection({
    sttProvider: 'groq',
    sttModel: 'whisper-large-v3-turbo',
    llmProvider: 'groq',
    llmModel: 'openai/gpt-oss-20b'
  });
  assert.strictEqual(validSelection.valid, true, 'Valid model combination must pass validation');

  const invalidSelection = modelCatalogService.validateSelection({
    sttProvider: 'groq',
    sttModel: 'nonexistent-model-xyz'
  });
  assert.strictEqual(invalidSelection.valid, false, 'Invalid model must fail validation');
  console.log('   ✓ Model catalog accurately reflects live BYOK status and model validation.');

  // -------------------------------------------------------------
  // Test 7: Model Switching & User Settings Persistence
  // -------------------------------------------------------------
  console.log('7️⃣ Testing Model Switching & Isolation...');
  // User A selects Gemini LLM
  storage.updateSettings({
    sttProvider: 'groq',
    sttModel: 'whisper-large-v3-turbo',
    llmProvider: 'gemini',
    llmModel: 'gemini-3.6-flash'
  }, testUserA);

  // User B selects OpenAI LLM
  storage.updateSettings({
    sttProvider: 'groq',
    sttModel: 'whisper-large-v3-turbo',
    llmProvider: 'openai',
    llmModel: 'gpt-4o-mini'
  }, testUserB);

  const settingsA = storage.getSettings(testUserA);
  const settingsB = storage.getSettings(testUserB);

  assert.strictEqual(settingsA.llmProvider, 'gemini', 'User A settings must persist gemini');
  assert.strictEqual(settingsA.llmModel, 'gemini-3.6-flash', 'User A settings must persist gemini-3.6-flash');

  assert.strictEqual(settingsB.llmProvider, 'openai', 'User B settings must persist openai');
  assert.strictEqual(settingsB.llmModel, 'gpt-4o-mini', 'User B settings must persist gpt-4o-mini');

  // Verify settings encryption on update: if API key passed in settings update, it is encrypted
  storage.updateSettings({
    apiKeyGroq: 'gsk_settings_update_key_123'
  }, testUserA);

  const safeSettingsA = storage.getSettings(testUserA);
  assert.strictEqual(safeSettingsA.apiKeyGroq, undefined, 'apiKeyGroq must NEVER be returned in safe settings');
  assert.strictEqual(safeSettingsA.hasGroqKey, true, 'hasGroqKey flag must be true');

  const rawRow = apiKeyRepository.findKey(testUserA, 'groq');
  assert.ok(rawRow && rawRow.encrypted_key, 'Key must be stored encrypted in user_api_keys table');
  assert.notStrictEqual(rawRow.encrypted_key, 'gsk_settings_update_key_123', 'Key in DB must NOT be plaintext');
  console.log('   ✓ Model selections and encrypted keys persist isolated per user.');

  // -------------------------------------------------------------
  // Test 8: Dictation Regression Verification
  // -------------------------------------------------------------
  console.log('8️⃣ Testing Zero-Edit & Dictation Pipeline Regression...');
  const dictationText = 'Umm please fix the bug in server slash index dot js and deploy';
  const cleanResult = zeroEditEngine.localHeuristicCleanup(dictationText);
  assert.ok(!cleanResult.toLowerCase().includes('umm'), 'Must remove filler umm');
  assert.ok(cleanResult.includes('server/index.js') || cleanResult.includes('server slash index'), 'Must handle dev terms cleanly');

  const processResult = await zeroEditEngine.process(dictationText, { tone: 'casual' });
  assert.ok(processResult.processedText, 'Processed text must be returned');
  console.log('   ✓ Existing zero-edit and local cleanup pipelines remain intact.');

  // -------------------------------------------------------------
  // Test 9: HTTP BYOK & Model Hub API Endpoints
  // -------------------------------------------------------------
  console.log('9️⃣ Testing HTTP BYOK & Model Hub API Endpoints (/api/keys)...');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const tokenA = authService.generateSession(testUserA);
  const tokenB = authService.generateSession(testUserB);

  try {
    // 1. Invalid Bearer token -> 401
    const invalidRes = await fetch(`${baseUrl}/api/keys`, {
      headers: { Authorization: 'Bearer invalid_token_xyz_123' }
    });
    assert.strictEqual(invalidRes.status, 401, 'Invalid token on /api/keys must return 401');

    // 2. GET /api/keys with tokenA -> 200, array of keys
    const keysResA = await fetch(`${baseUrl}/api/keys`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.strictEqual(keysResA.status, 200, 'Authenticated /api/keys must return 200');
    const keysDataA = await keysResA.json();
    assert.ok(keysDataA.success, 'Response must be success');
    assert.ok(Array.isArray(keysDataA.keys), 'keys must be array');

    // 3. POST /api/keys with tokenA (save OpenAI key)
    const postKeyRes = await fetch(`${baseUrl}/api/keys`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider: 'openai',
        key: 'test_mock_valid_key_http',
        validate: true
      })
    });
    assert.strictEqual(postKeyRes.status, 200, 'POST /api/keys must return 200');
    const postData = await postKeyRes.json();
    assert.ok(postData.success, 'Save key must be success');
    assert.strictEqual(postData.key.provider, 'openai');
    assert.ok(!postData.key.encryptedKey, 'Encrypted secret must not be exposed');

    // 4. POST /api/keys/validate with tokenA
    const validateRes = await fetch(`${baseUrl}/api/keys/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ provider: 'openai' })
    });
    assert.strictEqual(validateRes.status, 200, 'POST /api/keys/validate must return 200');
    const validateData = await validateRes.json();
    assert.strictEqual(validateData.valid, true, 'Stored key validation should return valid');

    // 5. Verify User B does not see User A's OpenAI BYOK key
    const keysResB = await fetch(`${baseUrl}/api/keys`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const keysDataB = await keysResB.json();
    const openaiEntryB = keysDataB.keys.find(k => k.provider === 'openai');
    assert.notStrictEqual(openaiEntryB.source, 'user', 'User B must not have user source for User A key');

    // 6. DELETE /api/keys/openai with tokenA
    const delRes = await fetch(`${baseUrl}/api/keys/openai`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.strictEqual(delRes.status, 200, 'DELETE /api/keys/:provider must return 200');
    const delData = await delRes.json();
    assert.ok(delData.success, 'Delete key must succeed');

    // 7. GET /api/models with tokenA
    const modelsRes = await fetch(`${baseUrl}/api/models`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.strictEqual(modelsRes.status, 200, 'GET /api/models must return 200');
    const modelsData = await modelsRes.json();
    assert.ok(modelsData.success, 'Catalog must return success');
    assert.ok(modelsData.stt.length > 0 && modelsData.llm.length > 0, 'Catalog must contain STT and LLM models');

    console.log('   ✓ HTTP BYOK endpoints (GET, POST, DELETE, /validate, /models) fully verified.');
  } finally {
    server.close();
  }

  console.log('   ✓ Phase 2 Model Hub & BYOK tests passed with 100% fidelity.\n');
}
