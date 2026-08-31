(() => {
  'use strict';
  document.documentElement.dataset.htmlSharePresentation = '1';
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  document.documentElement.dataset.reducedMotion = String(reduceMotion);

  // Enhancement only: disclosure, filter, and selected-item hooks all operate
  // on already-rendered HTML and never create required content.
  document.querySelectorAll('[data-disclosure-toggle]').forEach((toggle) => {
    const selector = toggle.getAttribute('data-disclosure-toggle');
    const target = selector ? document.querySelector(selector) : null;
    if (!(target instanceof HTMLDetailsElement)) return;
    toggle.setAttribute('aria-expanded', String(target.open));
    target.addEventListener('toggle', () => toggle.setAttribute('aria-expanded', String(target.open)));
  });
  document.querySelectorAll('[data-filter-input]').forEach((input) => {
    const selector = input.getAttribute('data-filter-input');
    const target = selector ? document.querySelector(selector) : null;
    if (!(input instanceof HTMLInputElement) || !target) return;
    const items = [...target.querySelectorAll('[data-filter-value]')];
    input.addEventListener('input', () => {
      const query = input.value.trim().toLocaleLowerCase();
      items.forEach((item) => {
        const value = item.getAttribute('data-filter-value')?.toLocaleLowerCase() ?? '';
        item.toggleAttribute('hidden', Boolean(query) && !value.includes(query));
      });
    });
  });
  document.querySelectorAll('[data-selected-value]').forEach((item) => {
    item.addEventListener('click', () => {
      const group = item.closest('[data-selection-group]');
      group?.querySelectorAll('[data-selected-value][aria-current="true"]').forEach((selected) => selected.setAttribute('aria-current', 'false'));
      item.setAttribute('aria-current', 'true');
    });
  });
  document.querySelectorAll('[data-travel-workspace]').forEach((workspace) => {
    const buttons = [...workspace.querySelectorAll('[data-trip-mode]')];
    const tripLinks = [...workspace.querySelectorAll('[data-trip-view-mode]')];
    const panels = [...workspace.querySelectorAll('[data-trip-panel]')];
    const applyMode = (mode) => {
      if (!mode) return;
      workspace.setAttribute('data-travel-mode', mode);
      buttons.forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.tripMode === mode)));
      panels.forEach((panel) => panel.toggleAttribute('hidden', panel.dataset.tripPanel !== mode));
    };
    applyMode(workspace.getAttribute('data-travel-mode') || 'planned');
    buttons.forEach((button) => button.addEventListener('click', () => applyMode(button.dataset.tripMode)));
    const revealTrip = (link) => {
      applyMode(link.dataset.tripViewMode);
      const target = document.getElementById(link.dataset.selectedValue || '');
      if (target instanceof HTMLDetailsElement) target.open = true;
    };
    tripLinks.forEach((link) => link.addEventListener('click', () => revealTrip(link)));

    const openTripFromHash = () => {
      const target = document.getElementById(window.location.hash.slice(1));
      if (!(target instanceof HTMLElement)) return;
      const mode = target.closest('[data-trip-panel]')?.dataset.tripPanel;
      if (mode) applyMode(mode);
      if (target instanceof HTMLDetailsElement) target.open = true;
    };
    openTripFromHash();
    window.addEventListener('hashchange', openTripFromHash);
  });
})();
