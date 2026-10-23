/*
 * Replication of Stephens, Fryberg, Markus, Johnson & Covarrubias (2012), Study 3.
 *
 * Design summary
 *   IVs:    welcome-letter condition (independent vs interdependent), BETWEEN subjects, randomly
 *           assigned (`condition`); social class (first- vs continuing-generation), measured
 *           (`first_gen`, derived from the two parental-education items).
 *   DV:     anagrams solved in 10 minutes = rows with task "anagram", action "submit",
 *           correct true (also saved per participant as `anagrams_solved`).
 *   Trials: 20 five-letter anagrams (Gilhooly, 1978), one at a time, typed answers, order
 *           shuffled per participant. "Skip for now" sends an item to the end of the queue;
 *           a submitted answer is final. One 10-minute clock for the whole task. No feedback.
 *   Other:  manipulation check (2 items, 1-7); covariates race and high school GPA, collected
 *           in the demographics survey.
 *   Screening fields (cutoffs are decided in the preregistration, not here): completion,
 *           eligibility, unclassifiable social class, time spent on and scroll depth through the letter,
 *           window focus losses during the anagram task, self-reported outside help. Everyone can finish the study regardless.
 *
 * Eligibility: freshmen only ("Are you a freshman?" right after consent; "No" is thanked
 *           and the study ends, recorded as eligible = false).
 * Timeline: consent -> eligibility -> [demographics if position "before"] ->
 *   welcome letter (one page, themes and paragraphs revealed one click at a time) ->
 *   cover story + anagram instructions -> anagram task -> manipulation check ->
 *   [demographics if position "after"] -> final questions -> debrief.
 */

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
window.TEMPLATE_VERSION = "0.1.0";

const EXPERIMENT = {
  // Firestore path: experiments/<id>/participants/... Change it for each phase so pilot data
  // and real data never mix (e.g. "stephens2012-pilot-b", "stephens2012-final").
  // "stephens2012-pilot-a" holds test sessions from building and checking the study; real
  // Pilot A participants start here.
  id: "stephens2012-pilot-a2",

  // Trials per Firestore write. 1 = save every trial the moment it finishes (dropouts leave
  // partial data). A participant makes roughly 20-60 anagram attempts, well inside the quota.
  chunk_size: 1,

  // Also store the complete jsPsych dataset on the participant document at the end.
  save_full_data_at_end: true,

  // Prolific only. Psych 1 pool participants are not on Prolific, so leave this empty.
  prolific_completion_code: "",

  // Contact shown in consent and debrief.
  contact_email: "stanfordpsych251@gmail.com",

  // The anagram task is answered by typing, so phones and tablets are turned away.
  requires_keyboard: true,

  // Anagram task settings (original: 20 anagrams, 10 minutes; Stephens et al., 2012, p. 1190).
  anagram_minutes: 10,
  randomize_anagram_order: true, // false = everyone sees the order in stimuli/materials.js
  show_anagram_timer: true,      // a countdown in the corner of the anagram screen

  // "after": demographics follow the manipulation check, so social class is not made salient
  // before the task. "before": demographics come right after consent, as in the writeup draft.
  demographics_position: "after",

  // "reveal": one page; a "Show next" button reveals the four themes one at a time (the photos
  // appear with the fourth), then each paragraph; earlier parts stay visible. Continue stays
  // grayed out (no countdown) until everything is revealed AND letter_min_seconds have passed.
  // "flipbook": two pages (cover, then letter), each with its own minimum viewing time.
  // "single": everything on one scrolling page, Continue unlocks after letter_min_seconds.
  letter_format: "reveal",
  // Flip book: seconds on each page before its button becomes available (cover, letter).
  letter_page_min_seconds: [10, 35],
  // "reveal" and "single": minimum seconds on the letter before Continue becomes available.
  letter_min_seconds: 45,

  // Header photo of the president, the same in both conditions. Set to "" to show a grey box.
  president_photo: "stimuli/president.webp",

  // Strip of student photos from the original materials: solo students in the independent
  // letter, groups in the interdependent letter (part of the manipulation).
  show_student_photos: true,
};

// True on anything with a mouse, trackpad, or stylus, including laptops with touchscreens.
// False on phones and tablets without a pointing device, which are also the devices with no
// physical keyboard. See docs/student-guide.md "Devices".
function hasFinePointer() {
  return !!(window.matchMedia && window.matchMedia("(any-pointer: fine)").matches);
}

// `?emulator=1` in the URL sends data to the local emulator instead of the real project.
// Used by `npm test`; handy for development too (start it with `npm run emulators`).
const URL_PARAMS = new URLSearchParams(window.location.search);
const USE_EMULATOR = URL_PARAMS.get("emulator") === "1";
// `?chunk_size=N` overrides the setting above; used by the test suite to exercise chunked writes.
const CHUNK_SIZE = Number(URL_PARAMS.get("chunk_size")) || EXPERIMENT.chunk_size;
// Test-only: `?cc=CODE` sets a Prolific completion code during emulator runs, so the test
// suite can check the screen a participant sees once you have set yours. Ignored in live runs.
if (USE_EMULATOR && URL_PARAMS.get("cc")) EXPERIMENT.prolific_completion_code = URL_PARAMS.get("cc");
// Test/pilot-only: `?anagram_seconds=N` shortens the anagram clock, honoured only in emulator
// runs or on your own machine (localhost), never on the live site.
const IS_LOCAL = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const ANAGRAM_MS = ((USE_EMULATOR || IS_LOCAL) && Number(URL_PARAMS.get("anagram_seconds")))
  ? Number(URL_PARAMS.get("anagram_seconds")) * 1000
  : EXPERIMENT.anagram_minutes * 60 * 1000;
// Same rule for `?letter_seconds=N`, which shortens the letter's minimum reading time.
const LETTER_MIN_MS = ((USE_EMULATOR || IS_LOCAL) && URL_PARAMS.get("letter_seconds") !== null)
  ? Number(URL_PARAMS.get("letter_seconds")) * 1000
  : EXPERIMENT.letter_min_seconds * 1000;
// Per-page minimums for the flip book; `?letter_seconds=N` sets every page to N (test/pilot only).
const LETTER_PAGE_MIN_MS = ((USE_EMULATOR || IS_LOCAL) && URL_PARAMS.get("letter_seconds") !== null)
  ? EXPERIMENT.letter_page_min_seconds.map(() => Number(URL_PARAMS.get("letter_seconds")) * 1000)
  : EXPERIMENT.letter_page_min_seconds.map((sec) => sec * 1000);

// Parental education answers that count as a 4-year degree or more.
const FOUR_YEAR = ["bachelors", "graduate"];
const EDUCATION_CHOICES = [
  { value: "less_than_hs", text: "Less than high school" },
  { value: "high_school", text: "High school diploma or GED" },
  { value: "some_college", text: "Some college, no degree" },
  { value: "associates", text: "Associate's degree (2-year)" },
  { value: "bachelors", text: "Bachelor's degree (4-year)" },
  { value: "graduate", text: "Graduate or professional degree (e.g., MA, PhD, MD, JD)" },
  { value: "dont_know", text: "Don't know" },
  { value: "not_applicable", text: "Not applicable (no second parent/guardian)" },
];

// First-generation = neither parent/guardian has a 4-year degree (Stephens et al., 2012, p. 1186).
// Returns true / false, or null when the answers cannot classify the participant.
// Rule (student's decision): classify on the parent(s) whose education is known. Continuing-gen
// if any parent has a 4-year degree; first-gen if at least one parent's education is known and
// below a 4-year degree (a "Don't know" or "Not applicable" for the other is ignored);
// unclassifiable (null) if no parent's education is known. The report applies the same rule
// to the raw answers.
const NO_FOUR_YEAR = ["less_than_hs", "high_school", "some_college", "associates"];
function classifyFirstGen(p1, p2) {
  if (FOUR_YEAR.includes(p1) || FOUR_YEAR.includes(p2)) return false;
  return NO_FOUR_YEAR.includes(p1) || NO_FOUR_YEAR.includes(p2) ? true : null;
}

// ---------------------------------------------------------------------------
// Boot: connect the saver first so even a crash in the first trial gets logged.
// ---------------------------------------------------------------------------
(async function main() {
  const deviceSupported = !EXPERIMENT.requires_keyboard || hasFinePointer();

  const saver = await DataSaver.init({
    experiment_id: EXPERIMENT.id,
    chunk_size: CHUNK_SIZE,
    save_full_data_at_end: EXPERIMENT.save_full_data_at_end,
    use_emulator: USE_EMULATOR,
    contact_email: EXPERIMENT.contact_email,
  });
  window.__saver = saver; // for debugging and the automated test

  // Record the device verdict on the participant document before anything else, so a
  // participant turned away below is still visible in the data rather than simply absent.
  saver.updateParticipant({ device_supported: deviceSupported, requires_keyboard: EXPERIMENT.requires_keyboard });

  if (!deviceSupported) {
    document.body.innerHTML =
      '<div id="device-unsupported" class="jspsych-content" style="max-width:640px;margin:15vh auto;font:16px/1.6 system-ui,sans-serif;">' +
      "<h2>Please use a computer</h2>" +
      "<p>This study needs a computer with a physical keyboard, because part of it is answered " +
      "by typing. Phones and tablets cannot be used.</p>" +
      "<p>Please reopen this link on a laptop or desktop computer. Nothing has been recorded " +
      "against you.</p>" +
      "<p>Questions: <a href=\"mailto:" + EXPERIMENT.contact_email + "\">" + EXPERIMENT.contact_email + "</a></p></div>";
    return;
  }

  const jsPsych = initJsPsych({
    show_progress_bar: true,
    auto_update_progress_bar: false, // the anagram task has a variable number of trials
    on_data_update: (trial) => saver.onTrial(trial),
    on_finish: async () => {
      const el = jsPsych.getDisplayElement();
      el.innerHTML = '<div id="finish-message"><p class="thanks">Saving your responses…</p></div>';
      // finish() flushes remaining trials, marks the participant complete, and (only if
      // saving failed) appends a download-fallback box to the display element.
      const result = await saver.finish(jsPsych);
      const consentRow = jsPsych.data.get().filter({ task: "consent" }).values()[0];
      const consented = !consentRow || consentRow.consented !== false;
      const msg = document.getElementById("finish-message");

      if (!consented) {
        msg.innerHTML = "<h2 class='thanks'>Thank you</h2><p class='thanks'>You chose not to participate. " +
          "You may close this window" + (EXPERIMENT.prolific_completion_code ? " and return the study on Prolific" : "") + ".</p>";
        return;
      }
      const eligibilityRow = jsPsych.data.get().filter({ task: "eligibility" }).values()[0];
      if (eligibilityRow && eligibilityRow.eligible === false) {
        msg.innerHTML = "<h2 class='thanks' id='screened-out'>Thank you for your interest.</h2>" +
          "<p class='thanks'>This study is only open to freshmen. " +
          "You may close this window.</p>";
        return;
      }
      if (result.ok && EXPERIMENT.prolific_completion_code && !USE_EMULATOR) {
        msg.innerHTML = "<p class='thanks'>Saved. Returning you to Prolific…</p>";
        window.location.href =
          "https://app.prolific.com/submissions/complete?cc=" + EXPERIMENT.prolific_completion_code;
        return;
      }
      // In emulator/test runs we stay on the page instead of navigating to Prolific, so that
      // setting a completion code can never turn `npm test` or CI red. Live runs redirect above.
      msg.innerHTML =
        "<h2 class='thanks'>All done</h2>" +
        (result.ok ? "<p class='thanks'>Your responses were saved. Thank you for participating!</p>" : "") +
        (EXPERIMENT.prolific_completion_code
          ? "<p class='thanks'>Your completion code is <strong>" + EXPERIMENT.prolific_completion_code + "</strong>.</p>"
          : "");
    },
  });
  const progress = (p) => jsPsych.progressBar && (jsPsych.progressBar.progress = p);

  // Record the participant id and URL parameters on every trial row.
  jsPsych.data.addProperties({
    // Must be the run-scoped document id, so trial rows join to participants.csv on export.
    participant_id: saver.docId,
    prolific_pid: saver.params.PROLIFIC_PID || null,
    experiment_id: EXPERIMENT.id,
  });

  // Random assignment to the welcome-letter condition, recorded on every trial and on the
  // participant document. Simple randomization: at course sample sizes the two conditions
  // will be close to, but not exactly, equal in size, and the split within first-gen students
  // is not controlled. Check balance in the analysis.
  const condition = jsPsych.randomization.sampleWithoutReplacement(["independent", "interdependent"], 1)[0];
  jsPsych.data.addProperties({ condition: condition });
  saver.updateParticipant({ condition: condition, demographics_position: EXPERIMENT.demographics_position });

  // -------------------------------------------------------------------------
  // Consent (course-wide IRB text; edit only the contact address)
  // -------------------------------------------------------------------------
  const consent = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="consent">
        <h2>Consent</h2>
        <p>By answering the following questions, you are participating in a study being performed by
        cognitive scientists in the Stanford Department of Psychology. If you have questions about
        this research, please contact us at <a href="mailto:${EXPERIMENT.contact_email}">${EXPERIMENT.contact_email}</a>.
        You must be at least 18 years old to participate. Your participation in this research is
        voluntary. You may decline to answer any or all of the following questions. You may decline
        further participation, at any time, without adverse consequences. Your anonymity is assured;
        the researchers who have requested your participation will not receive any personal
        information about you.</p>
      </div>`,
    choices: ["I agree to participate", "I do not agree"],
    data: { task: "consent" },
    on_finish: (data) => {
      data.consented = data.response === 0;
      if (!data.consented) {
        // No end message here: jsPsych would paint it over the screen that on_finish renders.
        jsPsych.abortExperiment();
      }
    },
  };

  // -------------------------------------------------------------------------
  // Eligibility: freshmen (first-year students) only. Anyone answering "No" is thanked and the
  // study ends; the visit is still recorded with eligible = false so screen-outs can be counted.
  // -------------------------------------------------------------------------
  // Every question is required. Only income, gender and sex offer "Prefer not to say" (the
  // student's decision after wording review). Note: the course consent text says participants "may decline to answer any
  // or all of the following questions"; with this setting the only way to decline is to stop
  // the study. To be confirmed with the course staff before Pilot B.
  const required = { isRequired: true };
  // Required, with a "Prefer not to say" option (student's decision: income, gender and sex).
  // SurveyJS stores this answer as "none"; the report treats it as missing.
  const requiredPreferNot = { isRequired: true, showNoneItem: true, noneText: "Prefer not to say" };

  // Self-report questions are shown one per screen. Choosing an answer to a single-choice
  // question moves on automatically (the last one finishes the survey). Questions that need
  // typing, a multi-select, or the "Self-describe"/"Other" text wait for Next instead, since
  // there is no single moment when the answer is complete. (SurveyJS's own auto-advance also
  // fires when a typed box loses focus, so a click on Next could skip a screen; this does not.)
  // A page-level instruction is carried onto each question.
  const oneQuestionPerScreen = (json) => ({
    ...json,
    pageNextText: "Next",
    pages: json.pages.flatMap((page) => page.elements.map((el) => ({
      elements: [page.description && !el.description ? { ...el, description: page.description } : el],
    }))),
  });
  const autoAdvanceSingleChoice = (survey) => {
    survey.onValueChanged.add((sender, options) => {
      const q = options.question;
      if (!q || q.getType() !== "radiogroup" || q.isOtherSelected) return;
      setTimeout(() => {
        if (!sender.currentPage || !sender.currentPage.questions.includes(q)) return;
        if (sender.isLastPage) sender.completeLastPage(); else sender.nextPage();
      }, 350); // a brief pause so the chosen answer is seen before the screen changes
    });
  };
  const eligibility = {
    type: jsPsychSurvey,
    survey_json: {
      showQuestionNumbers: "off",
      completeText: "Continue",
      pages: [{
        elements: [
          { type: "radiogroup", name: "freshman", title: "Are you a freshman?", choices: ["Yes", "No"], isRequired: true },
        ],
      }],
    },
    data: { task: "eligibility" },
    on_finish: (data) => {
      const answer = (data.response || {}).freshman ?? null;
      data.freshman = answer;
      data.eligible = answer === "Yes";
      saver.updateParticipant({ freshman: answer, eligible: data.eligible });
      if (!data.eligible) jsPsych.abortExperiment();
    },
  };

  // -------------------------------------------------------------------------
  // Welcome letter (the manipulation). EXPERIMENT.letter_format picks the click-to-reveal page
  // (default), the two-page flip book, or a single scrolling page. Reading time is saved for
  // screening; scroll depth shows whether they reached the end of the letter text.
  // jsPsych scrolls inside its display element (overflow-y: auto), not the window.
  // -------------------------------------------------------------------------
  let letterMaxScroll = 0;
  let letterObserver = null;
  let letterObserverStart = null;
  let trackingScroll = false;
  const scroller = () => jsPsych.getDisplayContainerElement();
  // Depending on the browser and page, either jsPsych's container or the document itself
  // scrolls, so scroll depth is measured from where the letter's bottom edge sits on screen,
  // and scrolling is listened for anywhere on the page (capture phase).
  const onLetterScroll = () => {
    if (!trackingScroll) return;
    const el = document.querySelector(".letter");
    if (!el) return;
    const r = el.getBoundingClientRect();
    const seen = (window.innerHeight - r.top) / Math.max(1, r.height);
    letterMaxScroll = Math.max(letterMaxScroll, Math.max(0, Math.min(1, seen)));
  };
  const listenScroll = () => window.addEventListener("scroll", onLetterScroll, true);
  const unlistenScroll = () => window.removeEventListener("scroll", onLetterScroll, true);
  const scrollToTop = () => { scroller().scrollTop = 0; if (document.scrollingElement) document.scrollingElement.scrollTop = 0; };
  const stopLetterMotion = () => {
    clearTimeout(letterObserverStart);
    if (letterObserver) letterObserver.disconnect();
  };

  // Motion (CSS, identical in both conditions): the header, themes and photos animate in; each
  // paragraph rises into view as it scrolls on screen. Paragraphs already on screen wait until
  // the opening animation has finished (`delay`).
  const animateLetter = (root, delay) => {
    stopLetterMotion();
    const letterEl = root.querySelector(".letter");
    const chunks = [...letterEl.querySelectorAll(".letter-text p")];
    if (!("IntersectionObserver" in window)) return;
    letterEl.classList.add("animated");
    chunks.forEach((p) => p.classList.add("reveal"));
    letterObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add("is-visible"); letterObserver.unobserve(e.target); }
      }
    }, { threshold: 0.12 }); // root = the viewport; clipping by jsPsych's scroller is accounted for
    letterObserverStart = setTimeout(() => chunks.forEach((p) => letterObserver.observe(p)), delay);
  };

  const saveLetterTimes = (data, extra) => {
    onLetterScroll(); // final reading: scroll events arrive asynchronously, after the click
    trackingScroll = false;
    unlistenScroll();
    stopLetterMotion();
    data.letter_time_ms = data.rt;
    data.letter_max_scroll = Math.round(letterMaxScroll * 100) / 100; // 1 = scrolled to the bottom
    Object.assign(data, extra);
    saver.updateParticipant({ letter_time_ms: data.rt, letter_max_scroll: data.letter_max_scroll, ...extra });
    scrollToTop();
    progress(0.2);
  };

  // Two pages: cover (header, four themes, photos), then the letter. Each page's button unlocks
  // after its minimum (LETTER_PAGE_MIN_MS); "Previous page" turns back to the cover.
  const letterFlipbook = {
    type: jsPsychFlipbook,
    pages: STIMULI.letterPages(condition, EXPERIMENT.show_student_photos, EXPERIMENT.president_photo),
    min_ms: LETTER_PAGE_MIN_MS,
    next_label: "Next page",
    back_label: "Previous page",
    finish_label: "Continue",
    scroller: () => (document.scrollingElement && document.scrollingElement.scrollTop > 0 ? document.scrollingElement : scroller()),
    save_trial_parameters: { pages: false },
    data: { task: "letter", letter: condition, letter_format: "flipbook" },
    on_load: () => listenScroll(),
    swap_selector: ".letter-body",   // the gold header and photo stay still between pages
    on_page_shown: (index, pageEl, firstView) => {
      // Scroll depth is measured on the letter page, where the text is.
      trackingScroll = index === 1;
      if (index === 1) onLetterScroll();
      // Entrance animations only the first time each page is shown.
      if (firstView) animateLetter(pageEl, index === 0 ? 1800 : 300);
      else {
        stopLetterMotion();
        pageEl.querySelector(".letter").classList.add("cover-seen");
        pageEl.querySelectorAll(".letter-text p").forEach((p) => p.classList.remove("reveal"));
      }
    },
    on_finish: (data) => saveLetterTimes(data, {
      letter_min_ms: LETTER_PAGE_MIN_MS.reduce((a, b) => a + b, 0),
      letter_cover_ms: data.page_times_ms[0],
      letter_text_ms: data.page_times_ms[1],
      letter_cover_views: data.page_views[0],
    }),
  };

  // One page: Continue stays disabled for LETTER_MIN_MS and counts down on its label.
  let letterTick = null;
  const letterSinglePage = {
    type: jsPsychHtmlButtonResponse,
    stimulus: STIMULI.letterHtml(condition, EXPERIMENT.show_student_photos, EXPERIMENT.president_photo),
    choices: ["Continue"],
    button_html: (choice) => `<button class="jspsych-btn letter-continue">${choice}</button>`,
    enable_button_after: LETTER_MIN_MS,
    save_trial_parameters: { stimulus: false },
    data: { task: "letter", letter: condition, letter_format: "single" },
    on_load: () => {
      scrollToTop();
      trackingScroll = true;
      onLetterScroll();
      listenScroll();
      animateLetter(document, 1800);
      const btn = document.querySelector("#jspsych-html-button-response-btngroup button");
      const shownAt = Date.now();
      const label = () => {
        const left = Math.ceil((LETTER_MIN_MS - (Date.now() - shownAt)) / 1000);
        if (left > 0) btn.textContent = `Continue (available in ${left} s)`;
        else { btn.textContent = "Continue"; clearInterval(letterTick); }
      };
      label();
      letterTick = setInterval(label, 250);
    },
    on_finish: (data) => { clearInterval(letterTick); saveLetterTimes(data, { letter_min_ms: LETTER_MIN_MS }); },
  };

  // One page, revealed step by step. Step 1 (the first theme) is shown on load; each "Show next"
  // click reveals the next step: themes 2-4 (the photos appear with theme 4), then paragraphs
  // 1-8 (the signature appears with the last). Earlier steps stay visible. Continue is grayed
  // out, with no countdown, until every step is revealed and LETTER_MIN_MS have passed.
  let revealTick = null;
  let revealSavedMargin = "";
  const letterReveal = {
    type: jsPsychHtmlButtonResponse,
    stimulus: STIMULI.letterHtml(condition, EXPERIMENT.show_student_photos, EXPERIMENT.president_photo)
      + `<div class="reveal-controls"><button type="button" class="jspsych-btn reveal-next" id="reveal-next">Show next</button></div>`,
    choices: ["Continue"],
    button_html: (choice) => `<button class="jspsych-btn letter-continue">${choice}</button>`,
    save_trial_parameters: { stimulus: false },
    data: { task: "letter", letter: condition, letter_format: "reveal" },
    on_load: () => {
      // Pin the letter to the top: jsPsych centres short content vertically, so the letter would
      // otherwise shift on every click as it grows. Restored in on_finish.
      revealSavedMargin = jsPsych.getDisplayElement().style.margin;
      jsPsych.getDisplayElement().style.margin = "28px auto auto";
      scrollToTop();
      trackingScroll = true;
      listenScroll();
      const root = document.querySelector(".letter");
      const themes = [...root.querySelectorAll(".letter-themes li")];
      const strip = root.querySelector(".photo-strip");
      const paras = [...root.querySelectorAll(".letter-text p:not(.letter-sign)")];
      const sign = root.querySelector(".letter-sign");
      const steps = [
        ...themes.slice(0, 3).map((el) => [el]),
        [themes[3], strip].filter(Boolean),
        ...paras.slice(0, -1).map((el) => [el]),
        [paras[paras.length - 1], sign],
      ];
      steps.flat().forEach((el) => el.classList.add("reveal-step"));
      root.classList.add("revealing");

      const shownAt = performance.now();
      const revealMs = [];
      let shown = 0;
      const nextBtn = document.querySelector("#reveal-next");
      const cont = document.querySelector("#jspsych-html-button-response-btngroup button");
      const update = () => {
        const done = shown === steps.length;
        cont.disabled = !(done && performance.now() - shownAt >= LETTER_MIN_MS);
        nextBtn.hidden = done;
      };
      const revealStep = (scroll) => {
        steps[shown].forEach((el) => el.classList.add("shown"));
        revealMs.push(Math.round(performance.now() - shownAt));
        const last = steps[shown][steps[shown].length - 1];
        shown++;
        update();
        if (scroll) setTimeout(() => last.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
      };
      nextBtn.addEventListener("click", () => { if (shown < steps.length) revealStep(true); });
      revealStep(false);                       // the first theme is visible from the start
      revealTick = setInterval(update, 250);
      letterReveal._revealMs = revealMs;
      letterReveal._steps = steps.length;
    },
    on_finish: (data) => {
      clearInterval(revealTick);
      jsPsych.getDisplayElement().style.margin = revealSavedMargin;
      const ms = letterReveal._revealMs || [];
      data.reveal_ms = ms;                    // when each step was revealed (ms after the letter appeared)
      data.reveal_steps = letterReveal._steps;
      saveLetterTimes(data, {
        letter_min_ms: LETTER_MIN_MS,
        letter_reveal_last_ms: ms[ms.length - 1] ?? null,       // when the last paragraph appeared
        letter_after_last_ms: ms.length ? data.rt - ms[ms.length - 1] : null,  // time after it
      });
    },
  };
  const letter = { reveal: letterReveal, single: letterSinglePage, flipbook: letterFlipbook }[EXPERIMENT.letter_format] || letterReveal;

  // -------------------------------------------------------------------------
  // Cover story and anagram instructions
  // -------------------------------------------------------------------------
  // The cover story is the experimenter's script in the original (p. 1190), here on screen.
  const minutes = Math.round(ANAGRAM_MS / 60000);
  const coverStory = {
    type: jsPsychInstructions,
    pages: [
      `<div class="task-instructions">
         <p>We'd like you to complete and evaluate an activity that has been used in the past with
         incoming students. The task's purpose is to assess different learning styles.</p>
       </div>`,
    ],
    show_clickable_nav: true,
    button_label_next: "Continue",
    data: { task: "cover_story" },
  };
  const anagramInstructions = {
    type: jsPsychInstructions,
    pages: [
      `<div class="task-instructions">
         <h2>Anagrams</h2>
         <p>You will see ${STIMULI.anagrams.length} anagrams, one at a time. Each one is an
         English word with its letters scrambled. Rearrange the letters to find the word, type it
         in the box, and press <strong>Submit</strong>.</p>
         <p>For example, <span class="anagram-example">T A C</span> is <strong>CAT</strong>.</p>
         <p>You have <strong>${minutes > 0 ? minutes + " minutes" : Math.round(ANAGRAM_MS / 1000) + " seconds"}</strong>
         to solve as many as you can. If you get stuck, press <strong>Skip for now</strong>:
         skipped anagrams come back after you have seen all the others, as long as time remains.
         Once you submit an answer, you cannot change it.</p>
         <p>Please work on your own, without using websites, apps, or other people.</p>
       </div>`,
    ],
    show_clickable_nav: true,
    button_label_next: "Start",
    data: { task: "anagram_instructions" },
    on_finish: () => startAnagramTask(),
  };

  // -------------------------------------------------------------------------
  // Anagram task: a queue of items; skipped items go to the back; one shared deadline
  // -------------------------------------------------------------------------
  let queue = [];
  let deadline = null;
  let taskStartedAt = null;
  let focusLosses = 0;      // window blur events while the anagram task is running
  let trialFocusLosses = 0; // the same, for the current anagram only
  let attemptIndex = 0;
  const presentations = {};
  let anagramTaskRunning = false;
  window.addEventListener("blur", () => {
    if (anagramTaskRunning) { focusLosses++; trialFocusLosses++; }
  });

  function startAnagramTask() {
    const items = STIMULI.anagrams.slice();
    queue = EXPERIMENT.randomize_anagram_order ? jsPsych.randomization.shuffle(items) : items;
    taskStartedAt = Date.now();
    deadline = taskStartedAt + ANAGRAM_MS;
    anagramTaskRunning = true;
    saver.updateParticipant({ anagram_order: queue.map((it) => it.item_id), anagram_ms: ANAGRAM_MS });
  }

  const anagramTrial = {
    type: jsPsychAnagram,
    anagram: () => queue[0].anagram,
    deadline: () => deadline,
    show_timer: EXPERIMENT.show_anagram_timer,
    data: { task: "anagram" },
    on_start: () => { trialFocusLosses = 0; },
    on_finish: (data) => {
      const item = queue.shift();
      presentations[item.item_id] = (presentations[item.item_id] || 0) + 1;
      data.item_id = item.item_id;
      data.anagram = item.anagram;
      data.solution = item.solution;
      data.gilhooly_br = item.gilhooly_br;
      data.presentation = presentations[item.item_id]; // 1 = first time shown, 2+ = after a skip
      data.attempt_index = attemptIndex++;
      data.focus_losses = trialFocusLosses;
      data.timed_out = data.action === "timeout";
      data.skipped = data.action === "skip";
      // Scoring: only a submitted answer can be correct; case and spaces are ignored. Only the
      // target word counts (Gilhooly's words have single solutions; see materials/).
      data.correct = data.action === "submit"
        ? data.response.toLowerCase().replace(/\s+/g, "") === item.solution
        : null;
      if (data.action === "skip") queue.push(item);
      progress(0.2 + 0.55 * Math.min(1, (Date.now() - taskStartedAt) / ANAGRAM_MS));
    },
  };
  const anagramTask = {
    timeline: [anagramTrial],
    loop_function: () => queue.length > 0 && Date.now() < deadline,
  };

  const anagramEnd = {
    type: jsPsychHtmlButtonResponse,
    stimulus: () => {
      const outOfTime = queue.length > 0;
      return `<div class="task-instructions" id="anagram-end" data-reason="${outOfTime ? "time" : "finished"}">
        <p>Thank you. Please press Continue for the next part of the study.</p></div>`;
    },
    choices: ["Continue"],
    data: { task: "anagram_end" },
    on_start: () => {
      anagramTaskRunning = false;
      const rows = jsPsych.data.get().filter({ task: "anagram" }).values();
      const submitted = rows.filter((r) => r.action === "submit");
      const summary = {
        anagrams_solved: submitted.filter((r) => r.correct).length,
        anagrams_submitted: submitted.length,
        anagrams_unanswered: STIMULI.anagrams.length - submitted.length,
        anagram_skips: rows.filter((r) => r.action === "skip").length,
        anagram_focus_losses: focusLosses,
        anagram_time_used_ms: Math.min(ANAGRAM_MS, Date.now() - taskStartedAt),
        anagram_finished_early: queue.length === 0,
      };
      jsPsych.data.addProperties({ anagrams_solved: summary.anagrams_solved });
      saver.updateParticipant(summary);
    },
    on_finish: (data) => { data.reason = queue.length > 0 ? "time" : "finished"; progress(0.8); },
  };

  // -------------------------------------------------------------------------
  // Manipulation check (p. 1190): 1 = strongly disagree ... 7 = strongly agree
  // -------------------------------------------------------------------------
  const agreeScale = [
    "Strongly disagree", "Disagree", "Somewhat disagree", "Neither agree nor disagree",
    "Somewhat agree", "Agree", "Strongly agree",
  ].map((text, i) => ({ value: i + 1, text: `${text} (${i + 1})` }));
  const manipulationCheck = {
    type: jsPsychSurvey,
    survey_json: {
      showQuestionNumbers: "off",
      completeText: "Continue",
      pages: [{
        description: "How much do you agree with this statement?",
        elements: [
          { type: "radiogroup", name: "mc_individually_motivated", title: "Stanford University expects college students to be individually motivated.", choices: agreeScale, ...required },
          { type: "radiogroup", name: "mc_work_together", title: "Stanford University expects college students to work together with other students.", choices: agreeScale, ...required },
        ],
      }],
    },
    data: { task: "manipulation_check" },
    on_finish: (data) => {
      const r = data.response || {};
      const num = (v) => (typeof v === "number" ? v : null);
      data.mc_individually_motivated = num(r.mc_individually_motivated);
      data.mc_work_together = num(r.mc_work_together);
      progress(0.85);
    },
  };

  // -------------------------------------------------------------------------
  // Demographics. Every item is required (see the note on `required` above).
  // -------------------------------------------------------------------------
  const demographics = {
    type: jsPsychSurvey,
    survey_json: {
      showQuestionNumbers: "off",
      completeText: "Continue",
      pages: [
        {
          title: "About your family",
          elements: [
            { type: "radiogroup", name: "parent1_education", title: "What is the highest level of education completed by your first parent or guardian?", choices: EDUCATION_CHOICES.filter((c) => c.value !== "not_applicable"), ...required },
            { type: "radiogroup", name: "parent2_education", title: "What is the highest level of education completed by your second parent or guardian?", choices: EDUCATION_CHOICES, ...required },
            {
              type: "radiogroup", name: "household_income", title: "What is your family's approximate yearly household income?",
              choices: [
                { value: 1, text: "Less than $10,000" }, { value: 2, text: "$10,000 to $19,999" },
                { value: 3, text: "$20,000 to $29,999" }, { value: 4, text: "$30,000 to $49,999" },
                { value: 5, text: "$50,000 to $74,999" }, { value: 6, text: "$75,000 to $99,999" },
                { value: 7, text: "$100,000 to $200,000" }, { value: 8, text: "More than $200,000" },
              ],
              ...requiredPreferNot,
            },
          ],
        },
        {
          title: "About you",
          elements: [
            {
              // 18 or older, as the consent requires.
              type: "text", name: "age", title: "How old are you?", inputType: "number", min: 18, max: 99, isRequired: true,
              minErrorText: "Please enter an age between 18 and 99.", maxErrorText: "Please enter an age between 18 and 99.",
              validators: [
                { type: "regex", regex: "^[0-9]+$", text: "Please enter your age as a whole number of years, e.g. 18." },
                { type: "numeric", minValue: 18, maxValue: 99, text: "Please enter an age between 18 and 99." },
              ],
            },
            { type: "radiogroup", name: "gender", title: "What is your gender?", choices: ["Woman", "Man", "Non-binary"], showOtherItem: true, otherText: "Self-describe", ...requiredPreferNot },
            { type: "radiogroup", name: "sex", title: "What sex were you assigned at birth?", choices: ["Female", "Male", "Intersex"], ...requiredPreferNot },
            {
              type: "checkbox", name: "race", title: "What is your race or ethnicity? Select all that apply.",
              choices: [
                { value: "white", text: "White" }, { value: "asian", text: "Asian or Asian American" },
                { value: "latino", text: "Latino/a/x or Hispanic" }, { value: "black", text: "Black or African American" },
                { value: "american_indian", text: "American Indian or Alaska Native" },
                { value: "pacific_islander", text: "Native Hawaiian or Pacific Islander" },
              ],
              showOtherItem: true, otherText: "Other", ...required,
            },
          ],
        },
        {
          title: "High school",
          elements: [
            {
              type: "text", name: "hs_gpa", title: "What was your unweighted high school GPA (on a 4.0 scale)?",
              inputType: "number", min: 0, max: 4, step: 0.01, isRequired: true,
              minErrorText: "Please enter your unweighted GPA as a number from 0 to 4.0, e.g. 3.85.",
              maxErrorText: "Please enter your unweighted GPA as a number from 0 to 4.0, e.g. 3.85.",
              validators: [
                { type: "numeric", minValue: 0, maxValue: 4, text: "Please enter your unweighted GPA as a number from 0 to 4.0, e.g. 3.85." },
              ],
            },
          ],
        },
      ],
    },
    data: { task: "demographics" },
    on_finish: (data) => {
      const r = data.response || {};
      const race = Array.isArray(r.race) ? r.race : [];
      data.first_gen = classifyFirstGen(r.parent1_education, r.parent2_education);
      data.age = r.age === undefined ? null : Number(r.age);
      data.hs_gpa = r.hs_gpa === undefined ? null : Number(r.hs_gpa);
      // Analysis covariate (White vs non-White). Multiracial participants who include White
      // are coded as not White-only here; the raw selections are kept so the rule can change.
      data.race_white_only = race.length === 0 || race.includes("none") ? null : (race.length === 1 && race[0] === "white");
      jsPsych.data.addProperties({ first_gen: data.first_gen });
      saver.updateParticipant({
        first_gen: data.first_gen,
        race_white_only: data.race_white_only,
      });
      progress(0.92);
    },
  };

  // -------------------------------------------------------------------------
  // Final questions for screening (asked before the debrief reveals the cover story)
  // -------------------------------------------------------------------------
  const finalQuestions = {
    type: jsPsychSurvey,
    survey_json: {
      showQuestionNumbers: "off",
      completeText: "Continue",
      pages: [{
        elements: [
          {
            type: "radiogroup", name: "outside_help",
            title: "Did you use any outside help on the anagrams (for example, a website, an app, or another person)? Your answer will not affect your credit.",
            choices: ["No", "Yes"], ...required,
          },
        ],
      }],
    },
    data: { task: "final_questions" },
    on_finish: (data) => {
      const r = data.response || {};
      saver.updateParticipant({ outside_help: r.outside_help ?? null });
      progress(0.97);
    },
  };

  // -------------------------------------------------------------------------
  // Debrief: explains the goal and reveals both deceptions (the letter and the cover story)
  // -------------------------------------------------------------------------
  const debrief = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="debrief">
        <h2>Thank you</h2>
        <p>This study replicates an experiment on how the way a university describes itself
        relates to students' performance. Different participants read different messages:
        one described Stanford in terms of independence (e.g., exploring your own
        interests), the other in terms of interdependence (e.g., being part of a community).
        We are testing whether the message affects performance on the anagram task, and whether
        that effect differs for students whose parents did or did not attend a 4-year college.</p>
        <p><strong>Two things in this study were not what they seemed.</strong> First, the welcome
        message was written by the researchers, adapted from the materials of the original
        study. It was not written or approved by President Levin or the Office of the President,
        and it does not represent Stanford's official views. Second, the anagram task was described
        as assessing learning styles. In fact, it measured how many anagrams you solved. We did not
        tell you this beforehand because knowing the purpose could have changed how people
        performed. Your individual score is not used to judge you and is not shared with anyone.</p>
        <p>Please do not discuss the details of this study with other students who might take
        part, since that could affect the results.</p>
        <p>If you have questions about this research, contact
        <a href="mailto:${EXPERIMENT.contact_email}">${EXPERIMENT.contact_email}</a>.
        Press the button to save your responses and finish.</p>
      </div>`,
    choices: ["Finish"],
    save_trial_parameters: { stimulus: false },
    data: { task: "debrief" },
    on_finish: () => progress(1),
  };

  for (const t of [eligibility, manipulationCheck, demographics, finalQuestions]) {
    t.survey_json = oneQuestionPerScreen(t.survey_json);
    t.survey_function = autoAdvanceSingleChoice;
  }

  const before = EXPERIMENT.demographics_position === "before";
  await jsPsych.run([
    consent,
    eligibility,
    ...(before ? [demographics] : []),
    letter,
    coverStory,
    anagramInstructions,
    anagramTask,
    anagramEnd,
    manipulationCheck,
    ...(before ? [] : [demographics]),
    finalQuestions,
    debrief,
  ]);
})();
