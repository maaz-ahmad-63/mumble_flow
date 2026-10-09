/**
 * Murmur Flow — Voice & Text Snippets Controller
 * Phase 7: Personalization (App/Mode targeting, Search, Edit, Enable/Disable)
 */

export class SnippetsManager {
  constructor({ onSnippetTriggered }) {
    this.onSnippetTriggered = onSnippetTriggered;
    this.listContainer = document.getElementById('snippetsList');
    this.editIdInput = document.getElementById('snipEditId');
    this.triggerInput = document.getElementById('snipTriggerInput');
    this.nameInput = document.getElementById('snipNameInput');
    this.contentInput = document.getElementById('snipContentInput');
    this.appSelect = document.getElementById('snipAppSelect');
    this.modeSelect = document.getElementById('snipModeSelect');
    this.enabledCheck = document.getElementById('snipEnabledCheck');
    this.addBtn = document.getElementById('snipAddBtn');
    this.cancelBtn = document.getElementById('snipCancelEditBtn');
    this.searchInput = document.getElementById('snipSearchInput');

    this.items = [];
    this.init();
  }

  init() {
    if (this.addBtn) {
      this.addBtn.addEventListener('click', () => this.handleSave());
    }
    if (this.cancelBtn) {
      this.cancelBtn.addEventListener('click', () => this.resetForm());
    }
    if (this.searchInput) {
      this.searchInput.addEventListener('input', () => this.render());
    }
    this.load();
  }

  async load() {
    try {
      const res = await fetch('/api/snippets');
      this.items = await res.json();
      this.render();
    } catch (err) {
      console.warn('Could not load snippets:', err.message);
    }
  }

  render() {
    if (!this.listContainer) return;
    const query = (this.searchInput?.value || '').toLowerCase().trim();

    const filtered = this.items.filter(item => {
      if (!query) return true;
      const t = (item.trigger || '').toLowerCase();
      const n = (item.name || item.description || '').toLowerCase();
      const c = (item.content || '').toLowerCase();
      const a = (item.app || '').toLowerCase();
      const m = (item.mode || '').toLowerCase();
      return t.includes(query) || n.includes(query) || c.includes(query) || a.includes(query) || m.includes(query);
    });

    if (filtered.length === 0) {
      this.listContainer.innerHTML = `<p class="empty-state">No snippets found.</p>`;
      return;
    }

    this.listContainer.innerHTML = filtered.map(item => `
      <article class="list-row" style="opacity: ${item.enabled === false ? '0.6' : '1'}; flex-direction: column; align-items: stretch; gap: 8px;">
        <div class="list-row-top" style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <p class="list-kicker" style="margin: 0; font-weight: 600;">"${this.escape(item.trigger)}"</p>
              ${item.enabled === false ? '<span style="font-size: 10px; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; color: #888;">Disabled</span>' : ''}
              ${item.app && item.app !== 'all' ? `<span style="font-size: 10px; background: rgba(99,102,241,0.2); color: #818cf8; padding: 2px 6px; border-radius: 4px;">App: ${this.escape(item.app)}</span>` : ''}
              ${item.mode && item.mode !== 'all' ? `<span style="font-size: 10px; background: rgba(16,185,129,0.2); color: #34d399; padding: 2px 6px; border-radius: 4px;">Mode: ${this.escape(item.mode)}</span>` : ''}
            </div>
            <p class="hint" style="margin: 4px 0 0 0; font-size: 12px; color: #8e8ea0;">${this.escape(item.name || item.description || 'Custom Snippet')}</p>
          </div>
          <div class="list-row-actions" style="display: flex; gap: 6px;">
            <button type="button" class="btn-quiet" data-test-trigger="${this.escape(item.trigger)}" style="font-size: 12px; padding: 4px 8px;">Try</button>
            <button type="button" class="btn-quiet" data-toggle-snip="${item.id}" style="font-size: 12px; padding: 4px 8px;">
              ${item.enabled === false ? 'Enable' : 'Disable'}
            </button>
            <button type="button" class="btn-quiet" data-edit-snip="${item.id}" style="font-size: 12px; padding: 4px 8px;">Edit</button>
            <button type="button" class="btn-quiet" data-delete-snip="${item.id}" style="font-size: 12px; padding: 4px 8px; color: #ff6b6b;">Remove</button>
          </div>
        </div>
        <pre class="snippet-body" style="margin: 0; max-height: 120px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; font-size: 13px;">${this.escape(item.content)}</pre>
      </article>
    `).join('');

    // Attach listeners
    this.listContainer.querySelectorAll('[data-test-trigger]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const trigger = e.currentTarget.getAttribute('data-test-trigger');
        if (this.onSnippetTriggered) this.onSnippetTriggered(trigger);
      });
    });

    this.listContainer.querySelectorAll('[data-toggle-snip]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-toggle-snip');
        this.toggle(id);
      });
    });

    this.listContainer.querySelectorAll('[data-edit-snip]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-edit-snip');
        this.startEdit(id);
      });
    });

    this.listContainer.querySelectorAll('[data-delete-snip]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-delete-snip');
        this.delete(id);
      });
    });
  }

  startEdit(id) {
    const item = this.items.find(s => s.id === id);
    if (!item) return;

    if (this.editIdInput) this.editIdInput.value = item.id;
    if (this.triggerInput) this.triggerInput.value = item.trigger || '';
    if (this.nameInput) this.nameInput.value = item.name || item.description || '';
    if (this.contentInput) this.contentInput.value = item.content || '';
    if (this.appSelect) this.appSelect.value = item.app || 'all';
    if (this.modeSelect) this.modeSelect.value = item.mode || 'all';
    if (this.enabledCheck) this.enabledCheck.checked = item.enabled !== false;

    if (this.addBtn) this.addBtn.textContent = 'Update Snippet';
    if (this.cancelBtn) this.cancelBtn.style.display = 'inline-block';
    if (this.triggerInput) this.triggerInput.focus();
  }

  resetForm() {
    if (this.editIdInput) this.editIdInput.value = '';
    if (this.triggerInput) this.triggerInput.value = '';
    if (this.nameInput) this.nameInput.value = '';
    if (this.contentInput) this.contentInput.value = '';
    if (this.appSelect) this.appSelect.value = 'all';
    if (this.modeSelect) this.modeSelect.value = 'all';
    if (this.enabledCheck) this.enabledCheck.checked = true;
    if (this.addBtn) this.addBtn.textContent = 'Save snippet';
    if (this.cancelBtn) this.cancelBtn.style.display = 'none';
  }

  async handleSave() {
    const trigger = this.triggerInput.value.trim();
    const content = this.contentInput.value.trim();
    const name = (this.nameInput?.value || '').trim();
    const app = this.appSelect ? this.appSelect.value : 'all';
    const mode = this.modeSelect ? this.modeSelect.value : 'all';
    const enabled = this.enabledCheck ? this.enabledCheck.checked : true;
    const editId = this.editIdInput?.value;

    if (!trigger || !content) {
      alert('Trigger phrase and Expansion content are required.');
      return;
    }

    try {
      let res;
      if (editId) {
        res = await fetch(`/api/snippets/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trigger, content, name, description: name, app, mode, enabled })
        });
      } else {
        res = await fetch('/api/snippets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trigger, content, name, description: name, app, mode, enabled })
        });
      }

      const data = await res.json();
      if (data.snippets) {
        this.items = data.snippets;
        this.render();
        this.resetForm();
      }
    } catch (err) {
      alert('Failed to save snippet: ' + err.message);
    }
  }

  async toggle(id) {
    const item = this.items.find(s => s.id === id);
    if (!item) return;
    const newEnabled = item.enabled === false;

    try {
      const res = await fetch(`/api/snippets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled })
      });
      const data = await res.json();
      if (data.snippets) {
        this.items = data.snippets;
        this.render();
      }
    } catch (err) {
      alert('Failed to toggle snippet: ' + err.message);
    }
  }

  async delete(id) {
    if (!confirm('Are you sure you want to remove this snippet?')) return;
    try {
      const res = await fetch(`/api/snippets/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.snippets) {
        this.items = data.snippets;
        this.render();
      }
    } catch (err) {
      alert('Failed to delete snippet: ' + err.message);
    }
  }

  escape(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
