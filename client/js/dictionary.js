/**
 * Mumble AI — Personal Dictionary Controller
 * Phase 7: Personalization (Search, Spoken Mapping, Enable/Disable, Edit)
 */

export class DictionaryManager {
  constructor() {
    this.listContainer = document.getElementById('dictionaryList');
    this.editIdInput = document.getElementById('dictEditId');
    this.wordInput = document.getElementById('dictWordInput');
    this.spokenInput = document.getElementById('dictSpokenInput');
    this.categorySelect = document.getElementById('dictCategorySelect');
    this.hintInput = document.getElementById('dictHintInput');
    this.enabledCheck = document.getElementById('dictEnabledCheck');
    this.addBtn = document.getElementById('dictAddBtn');
    this.cancelBtn = document.getElementById('dictCancelEditBtn');
    this.searchInput = document.getElementById('dictSearchInput');

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
    if (this.wordInput) {
      this.wordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.handleSave();
      });
    }
    this.load();
  }

  async load() {
    try {
      const res = await fetch('/api/dictionary');
      this.items = await res.json();
      this.render();
    } catch (err) {
      console.warn('Could not load dictionary:', err.message);
    }
  }

  render() {
    if (!this.listContainer) return;
    const query = (this.searchInput?.value || '').toLowerCase().trim();

    const filtered = this.items.filter(item => {
      if (!query) return true;
      const w = (item.word || '').toLowerCase();
      const s = (item.spoken || '').toLowerCase();
      const h = (item.hint || '').toLowerCase();
      const c = (item.category || '').toLowerCase();
      return w.includes(query) || s.includes(query) || h.includes(query) || c.includes(query);
    });

    if (filtered.length === 0) {
      this.listContainer.innerHTML = `<p class="empty-state">No dictionary entries found.</p>`;
      return;
    }

    this.listContainer.innerHTML = filtered.map(item => `
      <article class="list-row" style="opacity: ${item.enabled === false ? '0.6' : '1'};">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <p class="list-word" style="margin: 0; font-weight: 600;">${this.escape(item.word)}</p>
            ${item.enabled === false ? '<span style="font-size: 10px; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; color: #888;">Disabled</span>' : ''}
          </div>
          <p class="hint" style="margin-top: 4px; font-size: 12px; color: #8e8ea0;">
            <strong>Spoken:</strong> "${this.escape(item.spoken || item.word)}" · 
            <em>${this.escape(item.category || 'general')}</em>
            ${item.hint ? ` · Hint: <em>${this.escape(item.hint)}</em>` : ''}
          </p>
        </div>
        <div style="display: flex; gap: 6px; align-items: center;">
          <button type="button" class="btn-quiet" data-toggle-id="${item.id}" style="font-size: 12px; padding: 4px 8px;">
            ${item.enabled === false ? 'Enable' : 'Disable'}
          </button>
          <button type="button" class="btn-quiet" data-edit-id="${item.id}" style="font-size: 12px; padding: 4px 8px;">Edit</button>
          <button type="button" class="btn-quiet" data-delete-id="${item.id}" style="font-size: 12px; padding: 4px 8px; color: #ff6b6b;">Remove</button>
        </div>
      </article>
    `).join('');

    // Attach listeners
    this.listContainer.querySelectorAll('[data-toggle-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-toggle-id');
        this.toggle(id);
      });
    });

    this.listContainer.querySelectorAll('[data-edit-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-edit-id');
        this.startEdit(id);
      });
    });

    this.listContainer.querySelectorAll('[data-delete-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-delete-id');
        this.delete(id);
      });
    });
  }

  startEdit(id) {
    const item = this.items.find(d => d.id === id);
    if (!item) return;

    if (this.editIdInput) this.editIdInput.value = item.id;
    if (this.wordInput) this.wordInput.value = item.word || '';
    if (this.spokenInput) this.spokenInput.value = item.spoken || item.word || '';
    if (this.categorySelect) this.categorySelect.value = item.category || 'general';
    if (this.hintInput) this.hintInput.value = item.hint || '';
    if (this.enabledCheck) this.enabledCheck.checked = item.enabled !== false;

    if (this.addBtn) this.addBtn.textContent = 'Update Entry';
    if (this.cancelBtn) this.cancelBtn.style.display = 'inline-block';
    if (this.wordInput) this.wordInput.focus();
  }

  resetForm() {
    if (this.editIdInput) this.editIdInput.value = '';
    if (this.wordInput) this.wordInput.value = '';
    if (this.spokenInput) this.spokenInput.value = '';
    if (this.hintInput) this.hintInput.value = '';
    if (this.enabledCheck) this.enabledCheck.checked = true;
    if (this.categorySelect) this.categorySelect.value = 'code';
    if (this.addBtn) this.addBtn.textContent = 'Add to Dictionary';
    if (this.cancelBtn) this.cancelBtn.style.display = 'none';
  }

  async handleSave() {
    const word = this.wordInput.value.trim();
    if (!word) {
      alert('Preferred output word is required.');
      return;
    }

    const spoken = (this.spokenInput?.value || word).trim();
    const category = this.categorySelect.value;
    const hint = this.hintInput.value.trim();
    const enabled = this.enabledCheck ? this.enabledCheck.checked : true;
    const editId = this.editIdInput?.value;

    try {
      let res;
      if (editId) {
        res = await fetch(`/api/dictionary/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word, spoken, category, hint, enabled })
        });
      } else {
        res = await fetch('/api/dictionary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word, spoken, category, hint, enabled })
        });
      }

      const data = await res.json();
      if (data.dictionary) {
        this.items = data.dictionary;
        this.render();
        this.resetForm();
      }
    } catch (err) {
      alert('Failed to save dictionary entry: ' + err.message);
    }
  }

  async toggle(id) {
    const item = this.items.find(d => d.id === id);
    if (!item) return;
    const newEnabled = item.enabled === false;

    try {
      const res = await fetch(`/api/dictionary/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled })
      });
      const data = await res.json();
      if (data.dictionary) {
        this.items = data.dictionary;
        this.render();
      }
    } catch (err) {
      alert('Failed to toggle entry: ' + err.message);
    }
  }

  async delete(id) {
    if (!confirm('Are you sure you want to remove this dictionary entry?')) return;
    try {
      const res = await fetch(`/api/dictionary/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.dictionary) {
        this.items = data.dictionary;
        this.render();
      }
    } catch (err) {
      alert('Failed to delete entry: ' + err.message);
    }
  }

  escape(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
