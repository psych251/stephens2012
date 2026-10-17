/*
 * jsPsych 8 plugin: one anagram, answered by typing.
 *
 * Shows the scrambled letters, a text box, and Submit / Skip buttons. Enter submits. The box
 * accepts letters only, up to the anagram's length, and pasting is blocked. The
 * trial ends on submit (non-empty answer), skip, or when the shared task deadline passes
 * (`deadline` is a Date.now() timestamp, so one clock covers the whole 10-minute task).
 * Scoring happens in experiment.js, so this plugin only reports what the participant did.
 */
var jsPsychAnagram = (function (jspsych) {
  "use strict";

  const info = {
    name: "anagram",
    version: "1.0.0",
    parameters: {
      anagram: { type: jspsych.ParameterType.STRING, default: undefined },
      deadline: { type: jspsych.ParameterType.INT, default: undefined },
      show_timer: { type: jspsych.ParameterType.BOOL, default: true },
      allow_skip: { type: jspsych.ParameterType.BOOL, default: true },
    },
    data: {
      response: { type: jspsych.ParameterType.STRING },
      action: { type: jspsych.ParameterType.STRING }, // "submit", "skip" or "timeout"
      rt: { type: jspsych.ParameterType.INT },
      time_left_ms: { type: jspsych.ParameterType.INT },
    },
  };

  function fmt(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  class AnagramPlugin {
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }

    trial(display_element, trial) {
      const start = performance.now();
      let done = false;

      display_element.innerHTML = `
        <div class="anagram-trial">
          ${trial.show_timer ? `<div class="anagram-timer" id="anagram-timer">${fmt(trial.deadline - Date.now())}</div>` : ""}
          <div class="anagram-letters" data-anagram="${trial.anagram}">${trial.anagram.split("").join(" ")}</div>
          <form id="anagram-form" autocomplete="off">
            <input id="anagram-input" type="text" maxlength="${trial.anagram.length}" spellcheck="false"
                   autocapitalize="off" autocorrect="off" aria-label="Your answer">
            <div class="anagram-buttons">
              <button type="submit" id="anagram-submit" class="jspsych-btn">Submit</button>
              ${trial.allow_skip ? '<button type="button" id="anagram-skip" class="jspsych-btn">Skip for now</button>' : ""}
            </div>
          </form>
        </div>`;

      const input = display_element.querySelector("#anagram-input");
      const timerEl = display_element.querySelector("#anagram-timer");
      input.focus();
      // Letters only (anything else is dropped as it is typed), and no pasting or dropping text.
      input.addEventListener("input", () => {
        const clean = input.value.replace(/[^a-zA-Z]/g, "").slice(0, trial.anagram.length);
        if (clean !== input.value) input.value = clean;
      });
      input.addEventListener("paste", (e) => e.preventDefault());
      input.addEventListener("drop", (e) => e.preventDefault());

      const end = (action) => {
        if (done) return;
        done = true;
        clearInterval(tick);
        clearTimeout(timeout);
        this.jsPsych.finishTrial({
          response: input.value.trim(),
          action: action,
          rt: Math.round(performance.now() - start),
          time_left_ms: Math.max(0, trial.deadline - Date.now()),
        });
      };

      display_element.querySelector("#anagram-form").addEventListener("submit", (e) => {
        e.preventDefault();
        if (input.value.trim() === "") { input.focus(); return; } // empty Enter does nothing
        end("submit");
      });
      if (trial.allow_skip) {
        display_element.querySelector("#anagram-skip").addEventListener("click", () => end("skip"));
      }

      const remaining = trial.deadline - Date.now();
      const timeout = setTimeout(() => end("timeout"), Math.max(0, remaining));
      const tick = setInterval(() => {
        if (timerEl) timerEl.textContent = fmt(trial.deadline - Date.now());
      }, 250);
    }
  }
  AnagramPlugin.info = info;
  return AnagramPlugin;
})(jsPsychModule);
