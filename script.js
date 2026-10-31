/*
 * Ablauf: Standbild → (Tippen) → Animation an derselben Stelle → letztes Bild
 * bleibt stehen → kleiner Replay-Button. Scheitert die Wiedergabe, erscheint
 * die native Videosteuerung.
 *
 * Zustände (data-state am <main>):
 *   idle      Standbild, Startknopf sichtbar
 *   starting  play() wurde aufgerufen, erstes Bild steht noch aus
 *   playing   Animation läuft
 *   paused    unterbrochen (z. B. App-Wechsel), Startknopf setzt fort
 *   ended     letztes Bild steht, Replay-Knopf sichtbar
 *   frozen    Easter Egg am Ende jeder Wiederholung („aber kälter“)
 *   fallback  native Videosteuerung
 */
(function () {
  "use strict";

  var scene = document.querySelector(".scene");
  var stage = document.querySelector(".stage");
  var video = document.querySelector(".stage__video");
  var image = document.querySelector(".stage__image");
  var playButton = document.querySelector(".control--play");
  var replayButton = document.querySelector(".control--replay");
  if (!scene || !stage || !video || !image || !playButton || !replayButton) return;

  // Wie lange nach dem Tippen auf das erste Bild gewartet wird,
  // bevor die native Steuerung angeboten wird.
  var START_TIMEOUT_MS = 12000;
  // Ladeanzeige erst zeigen, wenn der Start spürbar dauert.
  var BUSY_DELAY_MS = 350;
  // Sicherheitsnetz, falls kein Frame-Callback/timeupdate kommt.
  var REVEAL_FALLBACK_MS = 300;
  // Easter Egg: „HONEY?“, dann „WHERE IS MY SUPER SUIT?!“, dann ausblenden.
  var FROST_SUIT_MS = 1300;
  var FROST_OUT_MS = 3600;
  var FROST_END_MS = 4200;

  var state = "idle";
  var coldRun = false; // ab der ersten Wiederholung immer true
  var mediaFailed = false;
  var restoreFocus = false;
  var startTimer = 0;
  var busyTimer = 0;
  var revealTimer = 0;

  function setState(next) {
    state = next;
    scene.setAttribute("data-state", next);
    if (next !== "starting") {
      clearTimeout(busyTimer);
      clearTimeout(startTimer);
      playButton.removeAttribute("aria-busy");
    }
  }

  function reveal() {
    clearTimeout(revealTimer);
    if (!scene.classList.contains("is-revealed")) {
      scene.classList.add("is-revealed");
    }
  }

  // Erst überblenden, wenn das Video wirklich ein Bild zeigt –
  // so gibt es keinen leeren oder schwarzen Moment.
  function revealOnFirstFrame() {
    if (scene.classList.contains("is-revealed")) return;

    if (typeof video.requestVideoFrameCallback === "function") {
      video.requestVideoFrameCallback(reveal);
    }

    var onTime = function () {
      if (video.currentTime > 0) {
        video.removeEventListener("timeupdate", onTime);
        reveal();
      }
    };
    video.addEventListener("timeupdate", onTime);

    clearTimeout(revealTimer);
    revealTimer = setTimeout(reveal, REVEAL_FALLBACK_MS);
  }

  function fallback() {
    if (state === "fallback") return;
    setState("fallback");
    // Standbild als Poster, damit das Motiv sichtbar bleibt.
    if (!video.getAttribute("poster")) {
      video.setAttribute("poster", image.currentSrc || image.src);
    }
    video.controls = true;
  }

  function start() {
    if (state === "starting" || state === "playing" || state === "frozen" || state === "fallback") return;

    if (mediaFailed) {
      fallback();
      return;
    }

    var active = document.activeElement;
    restoreFocus = active === playButton || active === replayButton;

    var restart = state === "ended" || video.ended;
    if (restart) coldRun = true;
    setState("starting");

    busyTimer = setTimeout(function () {
      if (state === "starting") playButton.setAttribute("aria-busy", "true");
    }, BUSY_DELAY_MS);

    startTimer = setTimeout(function () {
      if (state === "starting") fallback();
    }, START_TIMEOUT_MS);

    if (restart) {
      try {
        video.currentTime = 0;
      } catch (err) {
        /* ignorieren – play() beginnt nach dem Ende ohnehin von vorn */
      }
    }

    // play() muss direkt im Tipp-Handler aufgerufen werden (iOS).
    var result;
    try {
      result = video.play();
    } catch (err) {
      fallback();
      return;
    }
    if (result && typeof result.catch === "function") {
      result.catch(function () {
        if (state === "starting") fallback();
      });
    }
  }

  function onMediaError() {
    mediaFailed = true;
    if (state === "starting" || state === "playing" || state === "paused") {
      fallback();
    }
  }

  // ---------- Video-Ereignisse ----------

  video.addEventListener("playing", function () {
    if (state === "fallback") return;
    setState("playing");
    revealOnFirstFrame();
  });

  video.addEventListener("pause", function () {
    // Beim regulären Ende ist video.ended bereits true.
    if (state === "playing" && !video.ended) setState("paused");
  });

  function finish() {
    setState("ended");
    if (restoreFocus) {
      try {
        replayButton.focus({ preventScroll: true });
      } catch (err) {
        replayButton.focus();
      }
    }
  }

  // Zusatzszene über dem stehenden letzten Bild; danach normaler Endzustand.
  function playFrost() {
    setState("frozen");
    scene.setAttribute("data-frost", "honey");
    setTimeout(function () {
      scene.setAttribute("data-frost", "suit");
    }, FROST_SUIT_MS);
    setTimeout(function () {
      scene.setAttribute("data-frost", "out");
    }, FROST_OUT_MS);
    setTimeout(function () {
      scene.removeAttribute("data-frost");
      finish();
    }, FROST_END_MS);
  }

  video.addEventListener("ended", function () {
    if (state === "fallback") return;
    reveal();
    if (coldRun) {
      playFrost();
    } else {
      finish();
    }
  });

  video.addEventListener("error", onMediaError);

  // ---------- Bedienung ----------

  playButton.addEventListener("click", start);
  replayButton.addEventListener("click", start);

  // Auch ein Tipp auf das Standbild startet die Animation.
  stage.addEventListener("click", function () {
    if (state === "idle") start();
  });

  // ---------- Initialisierung ----------

  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;

  if (!video.canPlayType || video.canPlayType("video/mp4") === "") {
    mediaFailed = true;
  }

  // Falls die Quelle schon vor dem Skript gescheitert ist.
  if (video.error) {
    mediaFailed = true;
  }

  playButton.hidden = false;
  replayButton.hidden = false;
  setState("idle");
})();
