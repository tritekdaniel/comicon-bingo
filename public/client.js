(async function () {
  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");

  // === Modals ===
  const confirmModal = document.getElementById("confirmModal");
  const confirmTitle = document.getElementById("confirmTitle");
  const confirmMsg = document.getElementById("confirmMsg");
  const confirmOk = document.getElementById("confirmOk");
  const confirmCancel = document.getElementById("confirmCancel");

  const bingoModal = document.getElementById("bingoModal");
  const bingoText = document.getElementById("bingoText");
  const bingoOk = document.getElementById("bingoOk");

  const completeModal = document.getElementById("completeModal");
  const completeOk = document.getElementById("completeOk");
  const completeScreenshot = document.getElementById("completeScreenshot");

  const prefModal = document.getElementById("prefModal");
  const yesPref = document.getElementById("yesPref");
  const noPref = document.getElementById("noPref");

  const newModal = document.getElementById("newModal");
  const newTimerText = document.getElementById("newTimerText");
  const confirmNew = document.getElementById("confirmNew");
  const cancelNew = document.getElementById("cancelNew");

  let currentBoard = null;
  let pendingCell = null;

  let completedRows = new Set();
  let completedCols = new Set();
  let completedDiags = new Set();

  const api = async (path, opts = {}) => {
    const token =
      localStorage.getItem("bingo_token") ||
      (() => {
        const t = crypto.randomUUID();
        localStorage.setItem("bingo_token", t);
        return t;
      })();

    const res = await fetch(path, {
      headers: { "Content-Type": "application/json", "x-bingo-token": token },
      credentials: "same-origin",
      ...opts,
    });
    return res.json();
  };

  const show = (el) => el.classList.add("active");
  const hide = (el) => el.classList.remove("active");
  const isClicked = (sq) => sq.clicked || sq.fixed;


//------------------------this is not a good sign

// ---- blurbs ----
const newBoardBlurbs = [
  "Slate cleaned",
  "Spiders stomped... wait no that's bugs... and those aren't stomped either lol",
  "Digital dice rolled",
  "Realization set in",
  "Rethinking your decisions",
  "Happy nothing exploded",
  "Wary of random numbers",
  "Unsure of whether to proceed or quit",
  "Wants to go back",
  "Surprised that this worked",
  ":O",
  "Likes pushing buttons",
  "Wishing time travel was real",
  "'What have I done?'",
  "No going back now",
  "About to reroll again",
  "Tychophobia overcome",
  "Noting that this was intentional",
  "Apparently this is broken... jk this works of course",
  "Waiting for the 0.1 of CPU to catch up",
  "Convincing self this is fine",
  "Recovering from shock",
  "Embracing chaos",
  "Acknowledging that this is the best form of bingo",
  "Art arrangement accomplished",
  "It says 'Put something witty'. Huh.",
  "Crashing your web browser",
  "Drawing paper slip from digital hat",
  ":/ A computer spent a whole 0.001 seconds randomizing that last board",
  "Wishing render was faster",
  "Wait 'Allocate RAM' means fill it up, right?",
  "Removing jokers from deck... wait, DC villains is a potential square isn't it...",
  "Consulting the Magic 8- Ball... 'Outlook good' does not seem like a proper response for this",
  "Wasting the Web Developer's space",
  "Pretending to do something important",
  "If you regenerated a board before, you probably know why this text is here. Otherwise, you must be very confused.",
  "Trying to look productive",
  "This is indeed status text",
  "Wondering if anyone reads these",
  "Relieving boredom. Get it? Board-om? ...I'm sorry",
  "Making inside jokes",
  "*text*"
];

let lastBlurbIndex = -1;

//------------------------- erase me if need be

  // === Render board ===
  function renderBoard(board) {
    currentBoard = board;
    boardEl.innerHTML = "";
    board.forEach((row, r) =>
      row.forEach((cell, c) => {
        const div = document.createElement("div");
        div.className = "cell";
        if (cell.clicked) div.classList.add("clicked");
        if (cell.fixed) div.classList.add("fixed");
        div.dataset.r = r;
        div.dataset.c = c;
        div.innerHTML =
          cell.clicked && cell.image
            ? `<img src="${cell.image}" alt="${cell.text}">`
            : cell.text;

        // clickable always (including center) â€” client confirms mark/unmark
        div.addEventListener("click", () => {
          pendingCell = { r, c };
          if (!cell.clicked) {
            confirmTitle.textContent = "Mark this square?";
            confirmMsg.textContent = "Are you sure you want to select this square?";
          } else {
            confirmTitle.textContent = "Unmark?";
            confirmMsg.textContent = "Are you sure you want to unmark this square?";
          }
          show(confirmModal);
        });

        boardEl.appendChild(div);
      })
    );
  }

  // === Detect new bingos (new-lines only flash) ===
  function detectNewBingoLines(board) {
    const size = board.length;
    const newLines = [];

    const currentRows = new Set();
    const currentCols = new Set();
    const currentDiags = new Set();

    for (let r = 0; r < size; r++) {
      if (board[r].every(isClicked)) currentRows.add(r);
    }
    for (let c = 0; c < size; c++) {
      if (board.every((row) => isClicked(row[c]))) currentCols.add(c);
    }
    const diag1 = Array.from({ length: size }, (_, i) => board[i][i]);
    const diag2 = Array.from({ length: size }, (_, i) => board[i][size - 1 - i]);
    if (diag1.every(isClicked)) currentDiags.add("main");
    if (diag2.every(isClicked)) currentDiags.add("anti");

    // detect newly completed lines
    currentRows.forEach((r) => {
      if (!completedRows.has(r)) newLines.push({ type: "row", index: r });
    });
    currentCols.forEach((c) => {
      if (!completedCols.has(c)) newLines.push({ type: "col", index: c });
    });
    currentDiags.forEach((d) => {
      if (!completedDiags.has(d)) newLines.push({ type: d });
    });

    // update sets to current state
    completedRows = currentRows;
    completedCols = currentCols;
    completedDiags = currentDiags;

    // flash only the newly completed lines
    const flashLine = (coords) => {
      coords.forEach(([r, c]) => {
        const el = boardEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
        if (el) {
          el.classList.add("highlight");
          setTimeout(() => el.classList.remove("highlight"), 1500);
        }
      });
    };

    newLines.forEach((line) => {
      if (line.type === "row")
        flashLine(Array.from({ length: size }, (_, c) => [line.index, c]));
      else if (line.type === "col")
        flashLine(Array.from({ length: size }, (_, r) => [r, line.index]));
      else if (line.type === "main")
        flashLine(Array.from({ length: size }, (_, i) => [i, i]));
      else if (line.type === "anti")
        flashLine(Array.from({ length: size }, (_, i) => [i, size - 1 - i]));
    });

    return newLines;
  }

  // === Confirm click (toggle) ===
  confirmOk.addEventListener("click", async () => {
    hide(confirmModal);
    if (!pendingCell) return;
    const { r, c } = pendingCell;
    pendingCell = null;

    const res = await api("/api/click", {
      method: "POST",
      body: JSON.stringify({ row: r, col: c }),
    });
    if (!res || !res.board) return;

    renderBoard(res.board);

    const newLines = detectNewBingoLines(res.board);
    if (newLines.length > 0) {
      const types = newLines.map((l) => {
        if (l.type === "row") return "a row";
        if (l.type === "col") return "a column";
        if (l.type === "main" || l.type === "anti") return "a diagonal";
        return "a line";
      });
      const uniqueTypes = [...new Set(types)];
      bingoText.textContent = `🎉 Bingo! You completed ${uniqueTypes.join(" and ")}!`;
      show(bingoModal);
    }

    if (res.completed) {
      statusEl.textContent = "🎊 Board complete! Show your screen at the booth!";
      show(completeModal);
    }
  });

  confirmCancel.addEventListener("click", () => {
    pendingCell = null;
    hide(confirmModal);
  });

  // Bingo / complete modals
  bingoOk.addEventListener("click", () => hide(bingoModal));
  completeOk.addEventListener("click", () => hide(completeModal));
  completeScreenshot.addEventListener("click", () => {
    takeScreenshot();
    hide(completeModal);
  });

  const takeScreenshot = () => {
    import("https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm")
      .then(({ toPng }) => {
  const wrapper = document.createElement('div');
  wrapper.style.padding = '0 0 20px 0';  // Bottom padding
  wrapper.appendChild(boardEl.cloneNode(true));  // Clone to avoid moving the real board
  document.body.appendChild(wrapper);  // Temporarily add to DOM for accurate rendering
  return toPng(wrapper).finally(() => wrapper.remove());  // Clean up after
})
      .then((dataUrl) => {
        const link = document.createElement("a");
        link.download = "bingo.png";
        link.href = dataUrl;
        link.click();
      })
      .catch((e) => {
        console.error("screenshot error", e);
        alert(":/ Screenshot failed. Please contact maintainer @: arandomuser2319@gmail.com with the error");
      });
  };

  // Preferences
  yesPref.addEventListener("click", async () => {
    await api("/api/preference", { method: "POST", body: JSON.stringify({ preference: true }) });
    hide(prefModal);
    sessionStorage.setItem("askedPref", "1");
  });
  noPref.addEventListener("click", async () => {
    await api("/api/preference", { method: "POST", body: JSON.stringify({ preference: false }) });
    hide(prefModal);
    sessionStorage.setItem("askedPref", "1");
  });

  // New board flow
  document.getElementById("newBoard").addEventListener("click", () => {
    newTimerText.textContent = "You can confirm in 3...";
    show(newModal);
    confirmNew.disabled = true;
    let countdown = 3;
    const t = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(t);
        confirmNew.disabled = false;
        newTimerText.textContent = "You may now confirm.";
      } else {
        newTimerText.textContent = `You can confirm in ${countdown}...`;
      }
    }, 1000);
  });
  cancelNew.addEventListener("click", () => hide(newModal));
 confirmNew.addEventListener("click", async () => {
  hide(newModal);
  const res = await api("/api/newboard", { method: "POST" });

  if (res && res.ok) {
    completedRows.clear();
    completedCols.clear();
    completedDiags.clear();
    renderBoard(res.board);

    let index;
    do {
      index = Math.floor(Math.random() * newBoardBlurbs.length);
    } while (index === lastBlurbIndex && newBoardBlurbs.length > 1);

    lastBlurbIndex = index;
    statusEl.textContent = newBoardBlurbs[index];
  }
});


  // Buttons
  document.getElementById("reset").addEventListener("click", async () => {
    const { board } = await api("/api/board");
    completedRows.clear();
    completedCols.clear();
    completedDiags.clear();
    renderBoard(board);
  });
  document.getElementById("screenshot").addEventListener("click", takeScreenshot);

  // Initial load
  const { board, meta } = await api("/api/board");
  completedRows.clear();
  completedCols.clear();
  completedDiags.clear();
  renderBoard(board);
  if (meta && !sessionStorage.getItem("askedPref")) show(prefModal);
})();