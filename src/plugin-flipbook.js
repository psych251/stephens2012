/*
 * jsPsych 8 plugin: a short "flip book" of HTML pages with a minimum viewing time per page.
 *
 * Each page's forward button stays disabled, with a countdown on its label, until the participant
 * has spent at least `min_ms[i]` on that page (time on a page adds up across visits, so going
 * back and returning does not reset it). A back button allows turning to the previous page.
 * Pages turn with a short fade-and-slide, skipped for participants whose system asks for reduced
 * motion. If `swap_selector` is set (e.g. ".letter-body") and both pages contain it, only that
 * part is swapped and animated: everything around it (e.g. a shared header) stays still, so
 * nothing outside it re-renders or flickers. `on_page_shown(index, pageElement, firstView)` runs
 * each time a page is displayed.
 *
 * Data: rt (total ms), page_times_ms (total ms on each page), page_views (times each page was
 * shown), view_history ([{ page, viewing_time }] in order), min_ms.
 */
var jsPsychFlipbook = (function (jspsych) {
  "use strict";

  const info = {
    name: "flipbook",
    version: "1.0.0",
    parameters: {
      pages: { type: jspsych.ParameterType.HTML_STRING, default: undefined, array: true },
      min_ms: { type: jspsych.ParameterType.INT, default: [], array: true },
      next_label: { type: jspsych.ParameterType.STRING, default: "Next page" },
      back_label: { type: jspsych.ParameterType.STRING, default: "Previous page" },
      finish_label: { type: jspsych.ParameterType.STRING, default: "Continue" },
      on_page_shown: { type: jspsych.ParameterType.FUNCTION, default: () => {} },
      swap_selector: { type: jspsych.ParameterType.STRING, default: null },
      scroller: { type: jspsych.ParameterType.FUNCTION, default: () => null },
    },
    data: {
      rt: { type: jspsych.ParameterType.INT },
      page_times_ms: { type: jspsych.ParameterType.INT, array: true },
      page_views: { type: jspsych.ParameterType.INT, array: true },
      view_history: { type: jspsych.ParameterType.COMPLEX, array: true },
      min_ms: { type: jspsych.ParameterType.INT, array: true },
    },
  };

  const OUT_MS = 200;
  const IN_MS = 380;

  class FlipbookPlugin {
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }

    trial(display_element, trial) {
      const n = trial.pages.length;
      const minMs = trial.pages.map((_, i) => trial.min_ms[i] || 0);
      const times = Array(n).fill(0);
      const views = Array(n).fill(0);
      const history = [];
      const start = performance.now();
      let current = 0;
      let shownAt = performance.now();
      let turning = false;

      display_element.innerHTML = `
        <div class="flipbook">
          <div class="flipbook-stage"><div class="flipbook-page"></div></div>
          <div class="flipbook-nav">
            <button type="button" class="jspsych-btn flipbook-back" id="flipbook-back"></button>
            <span class="flipbook-indicator" id="flipbook-indicator"></span>
            <button type="button" class="jspsych-btn flipbook-next letter-continue" id="flipbook-next"></button>
          </div>
        </div>`;
      // Pin the book to the top of the screen while it is shown. jsPsych centres short content
      // vertically, so a short page and a long page would otherwise sit at different heights
      // and the header would jump on every turn. Restored when the trial ends.
      const savedMargin = display_element.style.margin;
      display_element.style.margin = "28px auto auto";
      const pageEl = display_element.querySelector(".flipbook-page");
      const back = display_element.querySelector("#flipbook-back");
      const next = display_element.querySelector("#flipbook-next");
      const indicator = display_element.querySelector("#flipbook-indicator");
      const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const spentOnCurrent = () => times[current] + (performance.now() - shownAt);
      const updateButtons = () => {
        const label = current === n - 1 ? trial.finish_label : trial.next_label;
        const left = Math.ceil((minMs[current] - spentOnCurrent()) / 1000);
        next.disabled = left > 0 || turning;
        next.textContent = left > 0 ? `${label} (available in ${left} s)` : label;
        back.textContent = trial.back_label;
        back.style.visibility = current > 0 ? "visible" : "hidden";
        back.disabled = turning;
        indicator.textContent = `Page ${current + 1} of ${n}`;
      };

      // Classes each page's root element is authored with, so a swap can change them while
      // keeping any classes added at run time (e.g. animation state).
      const parse = (html) => { const t = document.createElement("div"); t.innerHTML = html; return t; };
      const authored = trial.pages.map((html) => [...(parse(html).firstElementChild?.classList || [])]);

      // Put page i on screen. With `swap`, replace only the swap_selector part when possible.
      const render = (i, swap) => {
        const sel = trial.swap_selector;
        const curRoot = pageEl.firstElementChild;
        const curPart = sel && swap ? pageEl.querySelector(sel) : null;
        const fresh = parse(trial.pages[i]);
        const newPart = sel ? fresh.querySelector(sel) : null;
        if (curPart && newPart && curRoot && fresh.firstElementChild) {
          authored[current].forEach((c) => curRoot.classList.remove(c));
          authored[i].forEach((c) => curRoot.classList.add(c));
          curPart.replaceWith(newPart);
          return newPart;
        }
        pageEl.innerHTML = trial.pages[i];
        return sel ? pageEl.querySelector(sel) : null;
      };

      const show = (i, swap) => {
        const part = render(i, swap);
        current = i;
        views[i]++;
        shownAt = performance.now();
        pageEl.dataset.page = String(i);
        updateButtons();
        trial.on_page_shown(i, pageEl, views[i] === 1);
        return part || pageEl;
      };

      const leaveCurrent = () => {
        const spent = performance.now() - shownAt;
        times[current] += spent;
        history.push({ page: current, viewing_time: Math.round(spent) });
      };

      const toTop = () => { const sc = trial.scroller(); if (sc) sc.scrollTop = 0; };

      const turnTo = (i, direction) => {
        if (turning) return;
        leaveCurrent();
        if (reduceMotion) { toTop(); show(i, true); return; }
        turning = true;
        updateButtons();
        const outEl = (trial.swap_selector && pageEl.querySelector(trial.swap_selector)) || pageEl;
        outEl.classList.add(direction > 0 ? "page-out-forward" : "page-out-back");
        setTimeout(() => {
          toTop();
          const inEl = show(i, true);
          inEl.classList.add(direction > 0 ? "page-in-forward" : "page-in-back");
          setTimeout(() => {
            inEl.classList.remove("page-in-forward", "page-in-back");
            turning = false;
            updateButtons();
          }, IN_MS);
        }, OUT_MS);
      };

      next.addEventListener("click", () => {
        if (next.disabled) return;
        if (current < n - 1) { turnTo(current + 1, 1); return; }
        leaveCurrent();
        clearInterval(tick);
        display_element.style.margin = savedMargin;
        this.jsPsych.finishTrial({
          rt: Math.round(performance.now() - start),
          page_times_ms: times.map(Math.round),
          page_views: views,
          view_history: history,
          min_ms: minMs,
        });
      });
      back.addEventListener("click", () => { if (current > 0) turnTo(current - 1, -1); });

      const tick = setInterval(updateButtons, 250);
      toTop();
      show(0, false);
    }
  }
  FlipbookPlugin.info = info;
  return FlipbookPlugin;
})(jsPsychModule);
