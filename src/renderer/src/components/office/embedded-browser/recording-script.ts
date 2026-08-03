/** 内嵌浏览器 — 录制脚本注入 */

/** 注入点击/输入录制脚本到 webview 中 */
export function injectRecordingScript(wv: HTMLElement): void {
  const script = `
(function() {
  if (window.__ximoRecording) return;
  window.__ximoRecording = true;

  function getSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let depth = 0;
    while (el && el.nodeType === 1 && depth < 5) {
      let selector = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\\s+/).slice(0, 2);
        if (classes.length > 0) selector += '.' + classes.map(c => CSS.escape(c)).join('.');
      }
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(function(c) { return c.tagName === el.tagName; });
        if (siblings.length > 1) {
          selector += ':nth-of-type(' + (siblings.indexOf(el) + 1) + ')';
        }
      }
      parts.unshift(selector);
      el = el.parentElement;
      depth++;
    }
    return parts.join(' > ');
  }

  document.addEventListener('click', function(e) {
    if (!window.__ximoRecording) return;
    var selector = getSelector(e.target);
    var text = (e.target.textContent || '').trim().slice(0, 100);
    console.log('[XIMO_REC]' + JSON.stringify({
      type: 'click',
      selector: selector,
      text: text,
      timestamp: Date.now()
    }));
  }, true);

  document.addEventListener('change', function(e) {
    if (!window.__ximoRecording) return;
    var target = e.target;
    var tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      var selector = getSelector(target);
      var value = target.type === 'password' ? '***' : (target.value || '').slice(0, 200);
      console.log('[XIMO_REC]' + JSON.stringify({
        type: 'input',
        selector: selector,
        value: value,
        timestamp: Date.now()
      }));
    }
  }, true);

  window.__ximoStopRecording = function() { window.__ximoRecording = false; };
  console.log('[XIMO_REC] Recording script injected');
})();
  `.trim()

  try {
    ;(wv as unknown as { executeJavaScript: (code: string) => Promise<void> })
      .executeJavaScript(script)
      .catch(() => {})
  } catch { /* ignore */ }
}
