(async function () {
  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");

  // Modals
  const confirmModal = document.getElementById("confirmModal");
  const confirmTitle = document.getElementById("confirmTitle");
  const confirmMsg = document.getElementById("confirmMsg");
  const confirmOk = document.getElementById("confirmOk");
  const confirmCancel = document.getElementById("confirmCancel");

  const bingoModal = document.getElementById("bingoModal");
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

  // === Detect Bingos (fixed) ===
  function detectNewBingoLines(board) {
    const size = board.length;
    const newLines = [];

    const currentRows = new Set();
    const currentCols = new Set();
    const currentDiags = new Set();

    // Rows
    for (let r = 0; r < size; r++) {
      if (board[r].every(isClicked)) currentRows.add(r);
    }

    // Columns
    for (let c = 0; c < size; c++) {
      if (board.every((row) => isClicked(row[c]))) currentCols.add(c);
    }

    // Diagonals
    const diag1 = Array.from({ length: size }, (_, i) => board[i][i]);
    const diag2 = Array.from({ length: size }, (_, i) => board[i][size - 1 - i]);
    if (diag1.every(isClicked)) currentDiags.add("main");
    if (diag2.every(isClicked)) currentDiags.add("anti");

    // Detect new lines
    currentRows.forEach((r) => {
      if (!completedRows.has(r)) newLines.push({ type: "row", index: r });
    });
    currentCols.forEach((c) => {
      if (!completedCols.has(c)) newLines.push({ type: "col", index: c });
    });
    currentDiags.forEach((d) => {
      if (!completedDiags.has(d)) newLines.push({ type: d });
    });

    // Update sets to current state
    completedRows = currentRows;
    completedCols = currentCols;
    completedDiags = currentDiags;

    // Flash all currently complete lines every time
    const flashLine = (coords) => {
      coords.forEach(([r, c]) => {
        const el = boardEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
        if (el) {
          el.classList.add("highlight");
          setTimeout(() => el.classList.remove("highlight"), 1500);
        }
      });
    };

    currentRows.forEach((r) => {
      flashLine(Array.from({ length: size }, (_, c) => [r, c]));
    });
    currentCols.forEach((c) => {
      flashLine(Array.from({ length: size }, (_, r) => [r, c]));
    });
    if (currentDiags.has("main")) {
      flashLine(Array.from({ length: size }, (_, i) => [i, i]));
    }
    if (currentDiags.has("anti")) {
      flashLine(Array.from({ length: size }, (_, i) => [i, size - 1 - i]));
    }

    return newLines;
  }

  // === Confirm click ===
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
    if (newLines.length > 0) show(bingoModal);

    if (res.completed) {
      statusEl.textContent = "🎉 Bingo complete! Show your screen at the booth!";
      show(completeModal);
    }
  });

  confirmCancel.addEventListener("click", () => {
    pendingCell = null;
    hide(confirmModal);
  });

  // === Modals ===
  bingoOk.addEventListener("click", () => hide(bingoModal));
  completeOk.addEventListener("click", () => hide(completeModal));
  completeScreenshot.addEventListener("click", () => {
    takeScreenshot();
    hide(completeModal);
  });

  function takeScreenshot() {
    import("https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm")
      .then(({ toPng }) => toPng(boardEl))
      .then((dataUrl) => {
        const link = document.createElement("a");
        link.download = "bingo.png";
        link.href = dataUrl;
        link.click();
      })
      .catch(() =>
        alert("Screenshot failed — ensure images are local and same-origin.")
      );
  }

  // === Preferences ===
  yesPref.addEventListener("click", async () => {
    await api("/api/preference", {
      method: "POST",
      body: JSON.stringify({ preference: true }),
    });
    hide(prefModal);
    sessionStorage.setItem("askedPref", "1");
  });
  noPref.addEventListener("click", async () => {
    await api("/api/preference", {
      method: "POST",
      body: JSON.stringify({ preference: false }),
    });
    hide(prefModal);
    sessionStorage.setItem("askedPref", "1");
  });

  // === New Board ===
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
      statusEl.textContent = "New board generated.";
    }
  });

  // === Buttons ===
  document.getElementById("reset").addEventListener("click", async () => {
    const { board } = await api("/api/board");
    completedRows.clear();
    completedCols.clear();
    completedDiags.clear();
    renderBoard(board);
  });
  document.getElementById("screenshot").addEventListener("click", takeScreenshot);

  // === Load ===
  const { board, meta } = await api("/api/board");
  completedRows.clear();
  completedCols.clear();
  completedDiags.clear();
  renderBoard(board);
  if (meta && !sessionStorage.getItem("askedPref")) show(prefModal);
})();
