/*
 * Study materials for the Stephens et al. (2012) Study 3 replication.
 *
 * Letters: transcribed word for word from the original materials (see
 * materials/welcome-letters-draft.md), with the president updated to Jonathan Levin.
 * Shown as two pages like the original (cover with the four themes and photos, then the letter;
 * `letterPages`) or on one page (`letterHtml`). The president's photo is stimuli/president.webp (provided by the student;
 * confirm usage rights before real data collection). Student photos (stimuli/photos/) are
 * cropped from page 1 of the original materials, three per condition;
 * the signature is the president's name set in a script typeface (stimuli/fonts/), not a
 * reproduction of his handwritten signature.
 *
 * Anagrams: the backup set in materials/anagrams-backup.csv (main items only), built by
 * scripts/make-anagrams.py from Gilhooly (1978). If you change that CSV, update this list.
 */
window.STIMULI = (function () {
  // One page, laid out like the original two-page letter: header (with the president's photo
  // box), the four themes, a strip of student photos, then the letter in two columns.
  // `photos` are the student photos cropped from page 1 of the original materials for this
  // condition (solo students vs groups). Both conditions use the same frame (see CSS); `focus`
  // says which part of a photo to keep when it is cropped to fit, e.g. faces near the top.
  function onePage(themes, paragraphs, photos, showPhotos, presidentPhoto) {
    const box = (label, cls) => `<div class="photo-placeholder ${cls}"><span>${label}</span></div>`;
    return `
      <div class="letter">
        <div class="letter-header">
          <div class="letter-header-text">
            <div class="letter-from">From Stanford's President</div>
            <div class="letter-title">Welcome to Stanford University</div>
          </div>
          ${presidentPhoto
            ? `<img class="photo-head" src="${presidentPhoto}" alt="">`
            : box("Photo: President Levin", "photo-head")}
        </div>
        <div class="letter-body">
          <p class="letter-lead">At Stanford you have the opportunity to…</p>
          <ul class="letter-themes">
            ${themes.map((t) => `<li>${t}</li>`).join("")}
          </ul>
          ${showPhotos ? `<div class="photo-strip">${photos.map((ph) =>
            `<img class="photo-strip-item" src="${ph.src}" alt="" style="object-position: ${ph.focus || "center"}">`).join("")}</div>` : ""}
          <div class="letter-text">
            ${paragraphs.map((p) => `<p>${p}</p>`).join("")}
            <p class="letter-sign"><span class="letter-signature" aria-hidden="true">Jonathan Levin</span><br>Jonathan Levin<br>President</p>
          </div>
        </div>
      </div>`;
  }

  const letters = {
    independent: {
      photos: [
        { src: "stimuli/photos/independent-1.jpg", focus: "center 20%" },
        { src: "stimuli/photos/independent-2.jpg", focus: "center 65%" },
        { src: "stimuli/photos/independent-3.jpg", focus: "center 30%" },
      ],
      themes: [
        "Learn by exploring your personal interests",
        "Express your ideas and opinions",
        "Create your own intellectual journey",
        "Participate in independent research",
      ],
      paragraphs: [
        "I am delighted that you have decided that Stanford University is the right place for you. For the next few years, you will have many opportunities to explore new areas of interest and to learn from our faculty and from your own individual experiences.",
        "As Stanford's 13th president and a faculty member for more than 25 years, I encourage you to make the most of your time here, and I offer you a few suggestions to get you started.",
        "Stanford has an accomplished faculty. These teachers and researchers are here because of you and your desire to develop your extraordinary talents and unique interests. From your first days on campus, I urge you to get to know our faculty. Stop by during office hours to initiate a discussion, to share your ideas, or to simply tell the professor what you think about the course.",
        "Stanford presents you with many opportunities not available at other institutions. The university's breadth—from the arts to the environment to athletics to the sciences—provides you with individual freedom to cross departmental boundaries and to discover your intellectual passions.",
        "From your first days on campus, you will have the chance to work with distinguished faculty in small classes. If you are interested in research, Stanford offers you numerous avenues for pursuing student-initiated research or independent studies.",
        "Stanford is an intellectually vibrant place and you are a critical part of creating your own journey. Some of your most valuable experiences might involve working independently to understand a difficult concept or influencing others by expressing your own ideas.",
        "Stanford has a tradition of independence: of bold students who assert their own ideas, thoughts, and opinions. I hope you do the same while you are here. This is your time to develop yourself, to become your own person, and to explore your own personal interests—whether it is in the classroom, in a laboratory, in a theater, or on an athletic field.",
        "Above all, I urge you to be your own person, enjoy your intellectual journey, and to pursue it with enthusiasm.",
      ],
    },
    interdependent: {
      photos: [
        { src: "stimuli/photos/interdependent-1.jpg", focus: "center" },
        { src: "stimuli/photos/interdependent-2.jpg", focus: "center" },
        { src: "stimuli/photos/interdependent-3.jpg", focus: "center" },
      ],
      themes: [
        "Learn by being part of a community",
        "Connect with fellow students and faculty",
        "Work together with and learn from others",
        "Participate in collaborative research",
      ],
      paragraphs: [
        "I am delighted that you and your family have decided that Stanford is the right place for you. For the next few years, together with the Stanford community, you will have many opportunities to consider new areas of interest and to learn from our faculty and your peers.",
        "As Stanford's 13th president and a faculty member for more than 25 years, I encourage you to make the most of your time here, and I offer you a few suggestions to get you started.",
        "Stanford has an accomplished faculty. These teachers and researchers are here because of their desire to be a part of your and your classmates' experiences, to connect with students, and to learn from all of your backgrounds and experiences. From your first days on campus, I urge you to get to know our faculty. Stop by during office hours to continue a class discussion and to share your perspective. Take advantage of the opportunity to learn from the expertise of the professor and from the larger Stanford community.",
        "Stanford presents students with many opportunities not available anywhere else. The university's breadth—from the arts to the environment to athletics to the sciences—enables students to cross departmental boundaries and to discover the value of working with others who have a diversity of perspectives and experiences.",
        "From your first days on campus, you will have the chance to work with distinguished faculty in small classes. If you are interested in research, Stanford offers undergraduates numerous avenues for pursuing collaborative research.",
        "Stanford is an intellectually vibrant place and your fellow students are a critical part of your experience. Some of your most valuable experiences will be shared with your peers, whether you are working together to understand a difficult concept or learning more about one another.",
        "Stanford has a tradition of learning through community—bridging academic study with public service. I hope that you will do the same while you are here. This is your time to grow and to collaborate—whether it is in the classroom, in a laboratory, in a theater, or on an athletic field.",
        "Above all, I urge you to work together with others, enjoy the intellectual journey, and pursue it with enthusiasm.",
      ],
    },
  };

  // solution, anagram, Gilhooly (1978) bigram rank (lower = easier)
  const anagrams = [
    ["world", "DLWRO", 2], ["woman", "NAOWM", 12], ["plant", "LTNPA", 13], ["truck", "CUTKR", 16],
    ["juice", "ECUJI", 18], ["lunch", "NHULC", 23], ["mouth", "HMTUO", 25], ["glove", "OGELV", 27],
    ["honey", "YNOHE", 30], ["judge", "GJEDU", 44], ["doubt", "OBDTU", 47], ["cabin", "BNIAC", 62],
    ["pilot", "OLPTI", 74], ["fruit", "IUFTR", 75], ["virus", "RSUIV", 84], ["lyric", "IRLCY", 85],
    ["tulip", "ITPLU", 98], ["knife", "IENKF", 112], ["album", "LMUBA", 120], ["apron", "RNPAO", 149],
  ].map(([solution, anagram, br]) => ({ item_id: solution, solution, anagram, gilhooly_br: br }));

  const letterHtml = (condition, showPhotos, presidentPhoto) => {
    const L = letters[condition];
    return onePage(L.themes, L.paragraphs, L.photos, showPhotos, presidentPhoto);
  };

  // Two pages, as in the original materials: page 1 is the header, the four themes and the
  // photos; page 2 is the header and the letter itself. Built from the one-page version, so
  // the wording, photos and styling are identical.
  const letterPages = (condition, showPhotos, presidentPhoto) => {
    const page = document.createElement("div");
    page.innerHTML = letterHtml(condition, showPhotos, presidentPhoto);
    const cover = page.cloneNode(true);
    cover.querySelector(".letter-text").remove();
    cover.querySelector(".letter").classList.add("letter-page-cover");
    const text = page.cloneNode(true);
    text.querySelectorAll(".letter-lead, .letter-themes, .photo-strip").forEach((el) => el.remove());
    text.querySelector(".letter").classList.add("letter-page-text");
    return [cover.innerHTML, text.innerHTML];
  };

  return { letters, letterHtml, letterPages, anagrams };
})();
