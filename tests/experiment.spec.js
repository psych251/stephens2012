// End-to-end test: a robot participant runs the whole experiment.
//
// Two modes:
//   - Emulator mode (EMULATOR=1, set automatically by `npm test`): data must land in the
//     local Firestore emulator, the security rules must reject forbidden requests, and
//     client errors must be logged.
//   - Offline mode (plain `npx playwright test`): the experiment must still run to the end
//     and offer the JSON download fallback.
//
// If you change the timeline in experiment.js, update `runThroughExperiment` below so the
// robot still knows which buttons to press. That is a feature: the test documents the flow.

const { test, expect, devices } = require("@playwright/test");

const EMULATOR = process.env.EMULATOR === "1" || !!process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = "demo-psych251";
const EXPERIMENT_ID = "stephens2012-pilot-b";
const FS = `http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
// Shorter clocks for tests (honoured only in emulator runs and on localhost): the letter's
// Continue button unlocks after 1 s, and the robot finishes all 20 anagrams long before 120 s.
const CLOCK = "anagram_seconds=120&letter_seconds=1";

// Click "next" on an instructions page and wait until the page actually changes, because
// consecutive instruction screens reuse the same button id.
async function nextPage(page) {
  const before = await page.locator("#jspsych-content").innerHTML();
  await page.locator("#jspsych-instructions-next").click();
  await page.waitForFunction((b) => document.querySelector("#jspsych-content").innerHTML !== b, before);
}
// SurveyJS: click an option's label inside one question.
async function pick(page, question, text) {
  await page.locator(`[data-name="${question}"]`).getByText(text, { exact: true }).first().click();
}

// The robot's anagram strategy: answer the 1st correctly, skip the 2nd, answer the 3rd wrong,
// then answer everything else correctly (including the skipped one when it comes back).
// Expected: 21 anagram rows, 20 submitted, 19 correct, 1 skip.
async function doAnagrams(page) {
  const solutions = Object.fromEntries(
    (await page.evaluate(() => STIMULI.anagrams)).map((a) => [a.anagram, a.solution]));
  for (let n = 0; ; n++) {
    const letters = page.locator(".anagram-letters");
    const end = page.locator("#anagram-end");
    await letters.or(end).first().waitFor();
    if (await end.count()) return;
    const handle = await letters.elementHandle();
    const anagram = await letters.getAttribute("data-anagram");
    if (n === 1) {
      await page.locator("#anagram-skip").click();
    } else {
      await page.locator("#anagram-input").fill(n === 2 ? "zzzzz" : solutions[anagram].toUpperCase());
      await page.keyboard.press("Enter");
    }
    // Wait for this anagram's element to go: the next one reuses the same class.
    await page.waitForFunction((el) => !el.isConnected, handle);
  }
}

// Self-report questions are one per screen. A single-choice answer moves on by itself; typed
// and multi-select answers need Next (or Continue on a survey's last screen).
async function choose(page, question, text) {
  await pick(page, question, text);
  await expect(page.locator(`[data-name="${question}"]`)).toHaveCount(0);   // moved on
}
async function typeAnswer(page, question, value, button = "Next") {
  await page.locator(`[data-name="${question}"] input`).fill(value);
  await page.locator(`input[value="${button}"]`).click();
  await expect(page.locator(`[data-name="${question}"]`)).toHaveCount(0);
}

async function startStudy(page, freshman = "Yes") {
  await page.getByRole("button", { name: "I agree to participate" }).click();
  await pick(page, "freshman", freshman);                 // moves on by itself
}

// Welcome letter: one page revealed step by step. "Show next" reveals each theme, then each
// paragraph (12 steps, the first shown on load); Continue unlocks when everything is shown and
// the minimum time has passed (1 s in tests via ?letter_seconds=1).
async function readLetter(page) {
  const next = page.locator("#reveal-next");
  await expect(page.locator(".letter.revealing")).toBeVisible();
  while (await next.isVisible()) await next.click();
  const cont = page.locator("#jspsych-html-button-response-btngroup button");
  await expect(cont).toBeEnabled({ timeout: 10000 });
  await cont.scrollIntoViewIfNeeded();
  await cont.click();
}

async function runThroughExperiment(page, { answerAnagrams = true, finish = true, stopAtManipulationCheck = false } = {}) {
  await startStudy(page);
  await readLetter(page);
  await nextPage(page);                 // cover story
  await nextPage(page);                 // anagram instructions: "Start"
  if (answerAnagrams) await doAnagrams(page);
  await expect(page.locator("#anagram-end")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Continue" }).click();
  if (stopAtManipulationCheck) return;

  // Manipulation check (one statement per screen)
  await choose(page, "mc_individually_motivated", "Agree (6)");
  await choose(page, "mc_work_together", "Somewhat agree (5)");

  // Demographics (one question per screen)
  await choose(page, "parent1_education", "High school diploma or GED");
  await choose(page, "parent2_education", "Not applicable (no second parent/guardian)");
  await choose(page, "household_income", "$30,000 to $49,999");
  await typeAnswer(page, "age", "18");
  await choose(page, "gender", "Woman");
  await choose(page, "sex", "Female");
  await pick(page, "race", "White");                      // multi-select: needs Next
  await page.locator('input[value="Next"]').click();
  await expect(page.locator('[data-name="race"]')).toHaveCount(0);
  await typeAnswer(page, "hs_gpa", "3.9", "Continue");

  // Final screening question
  await choose(page, "outside_help", "No");

  // Debrief
  await expect(page.getByText("Two things in this study were not what they seemed")).toBeVisible();
  if (!finish) return;
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByText("All done")).toBeVisible({ timeout: 30000 });
}

async function fsGet(path) {
  // "Bearer owner" is the emulator's admin token: it bypasses security rules, like the Admin SDK.
  const r = await fetch(`${FS}/${path}`, { headers: { Authorization: "Bearer owner" } });
  return { status: r.status, body: r.status === 200 ? await r.json() : null };
}

// Unwrap Firestore REST "fields" encoding into plain JS.
function decode(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decode);
  return v;
}
function decodeFields(fields) {
  const out = {};
  for (const k of Object.keys(fields)) out[k] = decode(fields[k]);
  return out;
}

test.describe("experiment", () => {
  test("runs to the end and saves data", async ({ page }) => {
    const consoleErrors = [];
    page.on("pageerror", (e) => consoleErrors.push(String(e)));

    await page.goto(EMULATOR ? `/?emulator=1&PROLIFIC_PID=robot123&STUDY_ID=s1&SESSION_ID=sess1&${CLOCK}` : `/?${CLOCK}`);
    await page.waitForFunction(() => window.__saver && window.__saver.uid);
    const mode = await page.evaluate(() => window.__saver.mode);
    expect(mode).toBe(EMULATOR ? "emulator" : "offline");

    await runThroughExperiment(page);

    // No uncaught errors from the experiment itself.
    expect(consoleErrors, "uncaught page errors").toEqual([]);

    const uid = await page.evaluate(() => window.__saver.docId);
    const stats = await page.evaluate(() => window.__saver.stats);

    if (!EMULATOR) {
      // Offline: banner + download fallback, nothing else to check.
      await expect(page.locator("#data-saver-banner")).toHaveAttribute("data-kind", "offline");
      await expect(page.locator("#data-saver-fallback")).toBeVisible();
      return;
    }

    expect(stats.writes_failed).toBe(0);
    await expect(page.locator("#data-saver-fallback")).toHaveCount(0);

    // Participant document is complete and carries condition, scores, and screening fields.
    const p = await fsGet(`experiments/${EXPERIMENT_ID}/participants/${uid}`);
    expect(p.status).toBe(200);
    const pdoc = decodeFields(p.body.fields);
    expect(pdoc.completed).toBe(true);
    expect(["independent", "interdependent"]).toContain(pdoc.condition);
    expect(pdoc.prolific_pid).toBe("robot123");
    expect(pdoc.anagrams_solved).toBe(19);
    expect(pdoc.anagrams_submitted).toBe(20);
    expect(pdoc.anagrams_unanswered).toBe(0);
    expect(pdoc.anagram_skips).toBe(1);
    expect(pdoc.anagram_finished_early).toBe(true);
    expect(pdoc.anagram_order.length).toBe(20);
    expect(pdoc.first_gen).toBe(true);
    expect(pdoc.race_white_only).toBe(true);
    expect(pdoc.freshman).toBe("Yes");
    expect(pdoc.eligible).toBe(true);
    expect(pdoc.outside_help).toBe("No");
    expect(pdoc.letter_time_ms).toBeGreaterThan(0);
    expect(typeof pdoc.full_data).toBe("string");
    const full = JSON.parse(pdoc.full_data);
    expect(full.length).toBe(pdoc.n_trials);

    // One chunk per trial (chunk_size = 1), each carrying the trial data.
    const chunks = await fsGet(`experiments/${EXPERIMENT_ID}/participants/${uid}/trials?pageSize=500`);
    expect(chunks.status).toBe(200);
    const docs = (chunks.body.documents || []).map((d) => decodeFields(d.fields));
    expect(docs.length).toBe(pdoc.n_trials);
    const trials = docs.flatMap((d) => d.trials);

    const letter = trials.find((t) => t.task === "letter");
    expect(letter.letter).toBe(pdoc.condition);
    expect(letter.letter_format).toBe("reveal");
    expect(letter.letter_min_ms).toBe(1000);
    expect(letter.letter_time_ms).toBeGreaterThanOrEqual(900);
    expect(letter.reveal_steps).toBe(12);                         // 4 themes + 8 paragraphs
    expect(letter.reveal_ms.length).toBe(12);
    expect(letter.reveal_ms[0]).toBeLessThan(500);                // first theme shown on load
    expect(pdoc.letter_reveal_last_ms).toBe(letter.reveal_ms[11]);
    expect(letter.letter_max_scroll).toBeGreaterThan(0.95);       // the robot scrolled to the bottom
    expect(letter.letter_max_scroll).toBeLessThanOrEqual(1);

    const ana = trials.filter((t) => t.task === "anagram");
    expect(ana.length).toBe(21);
    expect(ana.every((t) => t.condition === pdoc.condition)).toBe(true);
    expect(ana.filter((t) => t.correct === true).length).toBe(19);
    const wrong = ana.filter((t) => t.correct === false);
    expect(wrong.length).toBe(1);
    expect(wrong[0].response).toBe("zzzzz");
    const skip = ana.find((t) => t.skipped);
    expect(skip.correct).toBe(null);
    const comeback = ana.find((t) => t.item_id === skip.item_id && t.presentation === 2);
    expect(comeback.correct).toBe(true);            // the skipped item came back and was solved
    expect(ana.some((t) => t.timed_out)).toBe(false);
    expect(new Set(ana.map((t) => t.item_id)).size).toBe(20);

    const mc = trials.find((t) => t.task === "manipulation_check");
    expect(mc.mc_individually_motivated).toBe(6);
    expect(mc.mc_work_together).toBe(5);
    const demo = trials.find((t) => t.task === "demographics");
    expect(demo.age).toBe(18);
    expect(demo.hs_gpa).toBe(3.9);
    expect(demo.response.household_income).toBe(4);
    expect(demo.response.race).toEqual(["white"]);
    expect(demo.first_gen).toBe(true);

    // Demographics come after the task (EXPERIMENT.demographics_position = "after").
    const order = trials.map((t) => t.task);
    expect(order.indexOf("demographics")).toBeGreaterThan(order.lastIndexOf("anagram"));

    // Every trial row must carry the same participant id as its participant document,
    // otherwise trials.csv and participants.csv cannot be joined in the analysis.
    expect([...new Set(trials.map((t) => t.participant_id))]).toEqual([uid]);
  });

  test("the anagram clock ends the task and records the unfinished item as timed out", async ({ page }) => {
    await page.goto(EMULATOR ? "/?emulator=1&anagram_seconds=3&letter_seconds=1" : "/?anagram_seconds=3&letter_seconds=1");
    await page.waitForFunction(() => window.__saver && window.__saver.docId);
    await runThroughExperiment(page, { answerAnagrams: false });
    if (!EMULATOR) return;
    const uid = await page.evaluate(() => window.__saver.docId);
    const pdoc = decodeFields((await fsGet(`experiments/${EXPERIMENT_ID}/participants/${uid}`)).body.fields);
    expect(pdoc.anagrams_solved).toBe(0);
    expect(pdoc.anagram_finished_early).toBe(false);
    const chunks = await fsGet(`experiments/${EXPERIMENT_ID}/participants/${uid}/trials?pageSize=500`);
    const trials = (chunks.body.documents || []).map((d) => decodeFields(d.fields)).flatMap((d) => d.trials);
    const ana = trials.filter((t) => t.task === "anagram");
    expect(ana.length).toBe(1);
    expect(ana[0].timed_out).toBe(true);
    expect(ana[0].correct).toBe(null);
    expect(trials.find((t) => t.task === "anagram_end").reason).toBe("time");
  });

  test("students who are not freshmen are thanked and screened out before the letter", async ({ page }) => {
    await page.goto(EMULATOR ? "/?emulator=1" : "/");
    await page.waitForFunction(() => window.__saver && window.__saver.docId);
    await startStudy(page, "No");
    await expect(page.locator("#screened-out")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".letter")).toHaveCount(0);
    if (!EMULATOR) return;
    const uid = await page.evaluate(() => window.__saver.docId);
    const pdoc = decodeFields((await fsGet(`experiments/${EXPERIMENT_ID}/participants/${uid}`)).body.fields);
    expect(pdoc.eligible).toBe(false);
    expect(pdoc.freshman).toBe("No");
  });

  test("required questions: one per screen, Prefer not to say only on income, gender and sex", async ({ page }) => {
    await page.goto(EMULATOR ? `/?emulator=1&${CLOCK}` : `/?${CLOCK}`);
    await page.waitForFunction(() => window.__saver && window.__saver.docId);
    await runThroughExperiment(page, { answerAnagrams: true, stopAtManipulationCheck: true });
    await expect(page.getByText("Prefer not to say")).toHaveCount(0);           // not on the manipulation check
    await expect(page.locator("[data-name]")).toHaveCount(1);                   // one question per screen
    await page.locator('input[value="Next"]').click();
    await expect(page.getByText("Response required.").first()).toBeVisible();
    await expect(page.locator('[data-name="mc_individually_motivated"]')).toBeVisible();   // still here
    await choose(page, "mc_individually_motivated", "Agree (6)");
    await choose(page, "mc_work_together", "Agree (6)");

    // Demographics: required, one per screen; "Prefer not to say" only on income, gender and sex.
    await expect(page.locator('[data-name="parent1_education"]')).toBeVisible();
    await expect(page.getByText("Prefer not to say")).toHaveCount(0);
    await page.locator('input[value="Next"]').click();
    await expect(page.getByText("Response required.").first()).toBeVisible();
    await choose(page, "parent1_education", "High school diploma or GED");
    await choose(page, "parent2_education", "Don't know");
    await choose(page, "household_income", "Prefer not to say");               // counts as an answer
    await expect(page.getByText("Prefer not to say")).toHaveCount(0);           // not on age
    await typeAnswer(page, "age", "18");
    await expect(page.locator('[data-name="gender"]').getByText("Prefer not to say")).toBeVisible();

    // "Self-describe" opens a text box and waits for it instead of moving on.
    const genderBox = page.locator('[data-name="gender"]').locator("textarea, input[type=text]");
    await expect(genderBox).toHaveCount(0);
    await pick(page, "gender", "Self-describe");
    await expect(genderBox.first()).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.locator('[data-name="gender"]')).toBeVisible();            // did not advance
    await genderBox.first().fill("Genderqueer");
    await page.locator('input[value="Next"]').click();
    await choose(page, "sex", "Prefer not to say");
    await expect(page.locator('[data-name="race"]').getByText("Prefer not to say")).toHaveCount(0);

    // Race "Other" opens a text box too (multi-select always waits for Next).
    const raceBox = page.locator('[data-name="race"]').locator("textarea, input[type=text]");
    await pick(page, "race", "Other");
    await expect(raceBox.first()).toBeVisible();
  });

  test("answer checks: anagram box takes letters only; age and GPA are validated", async ({ page }) => {
    await page.goto(EMULATOR ? `/?emulator=1&${CLOCK}` : `/?${CLOCK}`);
    await page.waitForFunction(() => window.__saver && window.__saver.docId);
    await startStudy(page);
    await readLetter(page);
    await nextPage(page);
    await nextPage(page);

    // Anagram box: non-letters are dropped and the length is capped at the anagram's length.
    const input = page.locator("#anagram-input");
    await input.pressSequentially("a1b c!d-efgh");
    await expect(input).toHaveValue("abcde");
    await input.fill("");
    await doAnagrams(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await choose(page, "mc_individually_motivated", "Agree (6)");
    await choose(page, "mc_work_together", "Agree (6)");
    await choose(page, "parent1_education", "High school diploma or GED");
    await choose(page, "parent2_education", "Don't know");
    await choose(page, "household_income", "$30,000 to $49,999");

    // Age must be a whole number from 18 to 99; typing alone never moves the screen on.
    const age = page.locator('[data-name="age"] input');
    for (const bad of ["17", "18.5", "120"]) {
      await age.fill(bad);
      await page.locator('input[value="Next"]').click();
      await expect(page.locator('[data-name="age"]').locator(".sd-question__erbox, .sd-error").first()).toBeVisible();
    }
    await typeAnswer(page, "age", "18");
    await choose(page, "gender", "Woman");
    await choose(page, "sex", "Female");
    await pick(page, "race", "White");
    await page.locator('input[value="Next"]').click();

    // GPA: unweighted only, so it must be between 0 and 4.0.
    await expect(page.locator('[data-name="hs_gpa_scale"]')).toHaveCount(0);
    await page.locator('[data-name="hs_gpa"] input').fill("4.3");
    await page.locator('input[value="Continue"]').click();
    await expect(page.getByText("from 0 to 4.0")).toBeVisible();
    await typeAnswer(page, "hs_gpa", "3.9", "Continue");
    await expect(page.locator('[data-name="outside_help"]')).toBeVisible();   // moved on
  });

  test("letter: one click per theme and paragraph; Continue stays grayed out until all shown and time passed", async ({ page }) => {
    await page.goto(EMULATOR ? "/?emulator=1&letter_seconds=4" : "/?letter_seconds=4");
    await page.waitForFunction(() => window.__saver && window.__saver.docId);
    await startStudy(page);
    const next = page.locator("#reveal-next");
    const cont = page.locator("#jspsych-html-button-response-btngroup button");
    const shownThemes = page.locator(".letter-themes li.shown");
    const shownParas = page.locator(".letter-text p.shown:not(.letter-sign)");
    await expect(shownThemes).toHaveCount(1);                      // first theme only
    await expect(shownParas).toHaveCount(0);
    await expect(cont).toBeDisabled();
    await expect(cont).toHaveText("Continue");                     // no countdown on the button
    for (let i = 2; i <= 4; i++) { await next.click(); await expect(shownThemes).toHaveCount(i); }
    await expect(page.locator(".photo-strip.shown")).toHaveCount(1);   // photos come with theme 4
    for (let i = 1; i <= 8; i++) {
      await expect(cont).toBeDisabled();
      await next.click();
      await expect(shownParas).toHaveCount(i);
    }
    await expect(page.locator(".letter-sign.shown")).toHaveCount(1);
    await expect(next).toBeHidden();
    await expect(cont).toBeEnabled({ timeout: 10000 });            // once the 4 s minimum has passed
    await expect(cont).toHaveText("Continue");
    await cont.click();
    await expect(page.locator(".task-instructions")).toBeVisible();
  });

  test("chunked writes (chunk_size > 1) save every trial", async ({ page }) => {
    test.skip(!EMULATOR, "needs the Firestore emulator");
    await page.goto(`/?emulator=1&chunk_size=5&${CLOCK}`);
    await page.waitForFunction(() => window.__saver && window.__saver.uid);
    await runThroughExperiment(page);
    const uid = await page.evaluate(() => window.__saver.docId);
    const p = decodeFields((await fsGet(`experiments/${EXPERIMENT_ID}/participants/${uid}`)).body.fields);
    const chunks = await fsGet(`experiments/${EXPERIMENT_ID}/participants/${uid}/trials?pageSize=500`);
    const docs = (chunks.body.documents || []).map((d) => decodeFields(d.fields));
    expect(docs.length).toBe(Math.ceil(p.n_trials / 5));
    const indices = docs.flatMap((d) => d.trials).map((t) => t.trial_index).sort((a, b) => a - b);
    expect(indices).toEqual([...Array(p.n_trials).keys()]);
  });

  test("declining consent ends the study without a thank-you-for-your-data message", async ({ page }) => {
    await page.goto(EMULATOR ? "/?emulator=1" : "/");
    await page.waitForFunction(() => window.__saver && window.__saver.uid);
    await page.getByRole("button", { name: "I do not agree" }).click();
    await expect(page.getByText("You chose not to participate")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Your responses were saved")).toHaveCount(0);
  });

  test("losing the connection at the end offers the download fallback instead of hanging", async ({ page, context }) => {
    test.skip(!EMULATOR, "needs the Firestore emulator");
    test.setTimeout(120000);
    // Run the real flow up to the last click, then cut the connection before "Finish".
    await page.goto(`/?emulator=1&${CLOCK}`);
    await page.waitForFunction(() => window.__saver && window.__saver.uid);
    await runThroughExperiment(page, { finish: false });
    await context.setOffline(true);
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.locator("#data-saver-fallback")).toBeVisible({ timeout: 40000 });
    await expect(page.getByText("connection to the server was lost")).toBeVisible();
    await expect(page.getByText("Your responses were saved")).toHaveCount(0);
    await context.setOffline(false);
  });

  test("a second run in the same browser is a new participant and saves cleanly", async ({ page }) => {
    test.skip(!EMULATOR, "needs the Firestore emulator");
    test.setTimeout(120000);

    const ids = [];
    for (let run = 0; run < 2; run++) {
      // Same page/context both times: the anonymous auth session persists, exactly as it
      // does for a student testing twice in one browser or a participant who reloads.
      await page.goto(`/?emulator=1&PROLIFIC_PID=rerun${run}&${CLOCK}`);
      await page.waitForFunction(() => window.__saver && window.__saver.docId);
      await runThroughExperiment(page);
      const info = await page.evaluate(() => ({
        uid: window.__saver.uid, docId: window.__saver.docId, stats: window.__saver.stats,
      }));
      expect(info.stats.writes_failed, "run " + run + " had failed writes").toBe(0);
      await expect(page.locator("#data-saver-fallback")).toHaveCount(0);
      ids.push(info);
    }

    expect(ids[0].uid).toBe(ids[1].uid);          // same browser, same anonymous identity
    expect(ids[0].docId).not.toBe(ids[1].docId);  // but a separate participant record

    // Both runs survive intact, with their own Prolific id and their own trials.
    for (let run = 0; run < 2; run++) {
      const p = await fsGet(`experiments/${EXPERIMENT_ID}/participants/${ids[run].docId}`);
      expect(p.status).toBe(200);
      const pdoc = decodeFields(p.body.fields);
      expect(pdoc.completed, "run " + run + " completed").toBe(true);
      expect(pdoc.prolific_pid).toBe("rerun" + run);
      const chunks = await fsGet(`experiments/${EXPERIMENT_ID}/participants/${ids[run].docId}/trials?pageSize=500`);
      expect((chunks.body.documents || []).length).toBe(pdoc.n_trials);
    }
  });

  test("setting a Prolific completion code does not break the test run", async ({ page }) => {
    // Regression test for the failure students hit right before launch: with a completion
    // code set, the live page redirects to Prolific, but a test run must stay put so that
    // `npm test` and CI keep passing.
    const navigations = [];
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });

    await page.goto(EMULATOR ? `/?emulator=1&cc=QA123CODE&${CLOCK}` : `/?cc=QA123CODE&${CLOCK}`);
    await page.waitForFunction(() => window.__saver && window.__saver.docId);
    await runThroughExperiment(page);

    expect(navigations.some((u) => u.includes("prolific.com")), "must not navigate to Prolific").toBe(false);
    if (EMULATOR) await expect(page.getByText("QA123CODE")).toBeVisible();
  });

  test("phones and tablets are turned away before consent", async ({ browser }) => {
    const context = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await context.newPage();
    await page.goto("http://localhost:8017/?emulator=1");
    await expect(page.locator("#device-unsupported")).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: "I agree to participate" })).toHaveCount(0);

    if (EMULATOR) {
      // The turned-away visit is still recorded, so phone traffic is visible in the data.
      await page.waitForFunction(() => window.__saver && window.__saver.docId);
      const docId = await page.evaluate(() => window.__saver.docId);
      await page.evaluate(() => window.__saver._settle());
      const p = await fsGet(`experiments/${EXPERIMENT_ID}/participants/${docId}`);
      const pdoc = decodeFields(p.body.fields);
      expect(pdoc.device_supported).toBe(false);
      expect(pdoc.completed).toBe(false);
    }
    await context.close();
  });

  test("a desktop browser is not turned away", async ({ page }) => {
    await page.goto(EMULATOR ? "/?emulator=1" : "/");
    await expect(page.getByRole("button", { name: "I agree to participate" })).toBeVisible();
    await expect(page.locator("#device-unsupported")).toHaveCount(0);
  });

  test("a write the database refuses is announced on the page, not only in the console", async ({ page }) => {
    test.skip(!EMULATOR, "needs the Firestore emulator");
    // Regression test for the state a student is in when they skip publishing the rules, or
    // once test-mode rules expire: sign-in succeeds, so the page used to look perfectly
    // healthy from consent to debrief and only admitted the problem on the last screen.
    await page.goto("/?emulator=1");
    await page.waitForFunction(() => window.__saver && window.__saver.docId);
    // Emulator runs carry an informational banner; what must be absent is a failure banner.
    await expect(page.locator('#data-saver-banner[data-kind="offline"]')).toHaveCount(0);

    // Force a genuine permission-denied on a normal save path by aiming the participant
    // document at someone else's id, which the rules refuse exactly as deny-all rules would.
    await page.evaluate(async () => {
      window.__saver.docId = "someone-else-deadbeef";
      await window.__saver.updateParticipant({ blocked: true });
    });

    const banner = page.locator("#data-saver-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("data-kind", "offline");
    await expect(banner).toContainText("NOT being saved");
    await expect(banner).toContainText("permission-denied");
    await expect(banner).toContainText("2.3");
    expect(await page.evaluate(() => window.__saver.stats.writes_failed)).toBeGreaterThan(0);
  });

  test("the download fallback tells the participant where to send the file", async ({ page }) => {
    await page.goto(EMULATOR ? "/?emulator=1" : "/");
    await page.waitForFunction(() => window.__saver && window.__saver.docId);
    await page.evaluate(() => window.__saver._offerDownload(null, "[]"));
    const box = page.locator("#data-saver-fallback");
    await expect(box).toBeVisible();
    await expect(box).toContainText("@");                       // a contact address is present
    await expect(box).toContainText("you will be paid");
    await expect(box.getByRole("link")).toHaveAttribute("href", /^mailto:/);
  });

  test("security rules reject reads and writes to other participants", async ({ page }) => {
    test.skip(!EMULATOR, "needs the Firestore emulator");
    await page.goto("/?emulator=1");
    await page.waitForFunction(() => window.__saver && window.__saver.uid);

    const results = await page.evaluate(async () => {
      const s = window.__saver;
      const fb = s.fb;
      const out = {};
      const attempt = async (name, fn) => {
        try { await fn(); out[name] = "allowed"; } catch (e) { out[name] = e.code || e.message; }
      };
      await attempt("read own doc", () =>
        fb.getDoc(fb.doc(s.db, "experiments", s.opts.experiment_id, "participants", s.docId)));
      await attempt("write other participant", () =>
        fb.setDoc(fb.doc(s.db, "experiments", s.opts.experiment_id, "participants", "someone-else"), { hacked: true }));
      await attempt("write other participant trials", () =>
        fb.setDoc(fb.doc(s.db, "experiments", s.opts.experiment_id, "participants", "someone-else", "trials", "c0"), { trials: [] }));
      await attempt("write unrelated collection", () =>
        fb.setDoc(fb.doc(s.db, "spam", "doc"), { spam: true }));
      await attempt("error doc with wrong uid", () =>
        fb.addDoc(fb.collection(s.db, "experiments", s.opts.experiment_id, "errors"), { uid: "not-me", message: "x" }));
      await attempt("own chunk (should be allowed)", () =>
        fb.setDoc(fb.doc(s.db, "experiments", s.opts.experiment_id, "participants", s.docId, "trials", "chunk-test"), { trials: [{ a: 1 }] }));
      await attempt("participant doc without the run suffix", () =>
        fb.setDoc(fb.doc(s.db, "experiments", s.opts.experiment_id, "participants", s.uid), { sneaky: true }));
      await attempt("another browser's run id", () =>
        fb.setDoc(fb.doc(s.db, "experiments", s.opts.experiment_id, "participants", "someone-else-abcd1234"), { sneaky: true }));
      return out;
    });

    expect(results["read own doc"]).toBe("permission-denied");
    expect(results["write other participant"]).toBe("permission-denied");
    expect(results["write other participant trials"]).toBe("permission-denied");
    expect(results["write unrelated collection"]).toBe("permission-denied");
    expect(results["error doc with wrong uid"]).toBe("permission-denied");
    expect(results["own chunk (should be allowed)"]).toBe("allowed");
    expect(results["participant doc without the run suffix"]).toBe("permission-denied");
    expect(results["another browser's run id"]).toBe("permission-denied");
  });

  test("uncaught errors are logged to the errors collection", async ({ page }) => {
    test.skip(!EMULATOR, "needs the Firestore emulator");
    await page.goto("/?emulator=1");
    await page.waitForFunction(() => window.__saver && window.__saver.uid);
    const uid = await page.evaluate(() => window.__saver.uid);

    // Simulate a bug in a trial: an uncaught exception.
    await page.evaluate(() => {
      setTimeout(() => { throw new Error("simulated bug in trial code"); }, 0);
    });
    await page.waitForFunction(() => window.__saver.stats.errors_logged >= 1);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));

    const errs = await fsGet(`experiments/${EXPERIMENT_ID}/errors?pageSize=100`);
    const mine = (errs.body.documents || []).map((d) => decodeFields(d.fields)).filter((d) => d.uid === uid);
    expect(mine.length).toBe(1);
    expect(mine[0].message).toContain("simulated bug");
    expect(mine[0].context.kind).toBe("uncaught");
  });
});
