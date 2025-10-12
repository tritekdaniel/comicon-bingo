(async function () {
  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");

  // Modal elements (we reuse newBoard modal for everything)
  const newModal = document.getElementById("newModal");
  const newTimerText = document.getElementById("newTimerText");
  const confirmNew = document.getElementById("confirmNew");
  const cancelNew = document.getElementById("cancelNew");

  const prefModal = document.getElementById("prefModal");
  const yesPref = document.getElementById("yesPref");
  const noPref = document.getElementById("noPref");

  let currentBoard = null;
  let pendingCell = null;

  // ✅ track completed lines
  let completedRows = new Set();
  let completedCols = new Set();
  let completedDiags = new Set(); // new for diagonals

  // --- Modal helper (safe cleanup so no duplicate buttons) ---
  function showModal(title, message, buttons) {
    const box = newModal.querySelector(".modal-box");
    newModal.querySelector("h3").textContent = title;
    newModal.querySelector("p").textContent = message;

    // hide newBoard timer & buttons
    newTimerText.style.display = "none";
    confirmNew.style.display = "none";
    cancelNew.style.display = "none";

    // remove any existing temp buttons
    box.querySelectorAll(".tempBtn").forEach((b) => b.remove());

    buttons.forEach(({ label, handler, secondary }) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.className = secondary ? "secondary tempBtn" : "tempBtn";
      btn.addEventListener("click", () => {
        newModal.classList.remove("active");
        handler();
      });
      box.appendChild(btn);
    });

    newModal.classList.add("active");
  }

  // --- API helper with unique token ---
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

  // --- Render board ---
  const renderBoard = (board) => {
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

        if (!cell.fixed) {
          div.addEventListener("click", () => {
            pendingCell = { r, c };
            showModal(
              "Mark this square?",
              "Are you sure you want to select this square?",
              [
                { label: "OK", handler: confirmClick },
                {
                  label: "Cancel",
                  handler: () => (pendingCell = null),
                  secondary: true,
                },
              ]
            );
          });
        }

        boardEl.appendChild(div);
      })
    );
  };

  // --- Helper: treat FREE as filled ---
  const isClicked = (sq) => sq.clicked || sq.fixed;

  // --- Detect new bingos & animate highlight (now includes diagonals) ---
  function detectNewBingoLines(board) {
    const size = board.length;
    const newLines = [];

    // check rows
    for (let r = 0; r < size; r++) {
      if (board[r].every(isClicked) && !completedRows.has(r)) {
        completedRows.add(r);
        newLines.push({ type: "row", index: r });
      }
    }

    // check columns
    for (let c = 0; c < size; c++) {
      if (board.every((row) => isClicked(row[c])) && !completedCols.has(c)) {
        completedCols.add(c);
        newLines.push({ type: "col", index: c });
      }
    }

    // check diagonals
    const diag1 = Array.from({ length: size }, (_, i) => board[i][i]);
    const diag2 = Array.from({ length: size }, (_, i) => board[i][size - 1 - i]);

    if (diag1.every(isClicked) && !completedDiags.has("main")) {
      completedDiags.add("main");
      newLines.push({ type: "diagMain" });
    }
    if (diag2.every(isClicked) && !completedDiags.has("anti")) {
      completedDiags.add("anti");
      newLines.push({ type: "diagAnti" });
    }

    // ✨ Highlight new lines
    newLines.forEach(({ type, index }) => {
      if (type === "row") {
        for (let c = 0; c < size; c++) {
          const el = boardEl.querySelector(`.cell[data-r="${index}"][data-c="${c}"]`);
          if (el) {
            el.classList.add("highlight");
            setTimeout(() => el.classList.remove("highlight"), 1000);
          }
        }
      } else if (type === "col") {
        for (let r = 0; r < size; r++) {
          const el = boardEl.querySelector(`.cell[data-r="${r}"][data-c="${index}"]`);
          if (el) {
            el.classList.add("highlight");
            setTimeout(() => el.classList.remove("highlight"), 1000);
          }
        }
      } else if (type === "diagMain") {
        for (let i = 0; i < size; i++) {
          const el = boardEl.querySelector(`.cell[data-r="${i}"][data-c="${i}"]`);
          if (el) {
            el.classList.add("highlight");
            setTimeout(() => el.classList.remove("highlight"), 1000);
          }
        }
      } else if (type === "diagAnti") {
        for (let i = 0; i < size; i++) {
          const el = boardEl.querySelector(`.cell[data-r="${i}"][data-c="${size - 1 - i}"]`);
          if (el) {
            el.classList.add("highlight");
            setTimeout(() => el.classList.remove("highlight"), 1000);
          }
        }
      }
    });

    return newLines.map((l) => l.type);
  }

  // --- Confirm marking a cell ---
  async function confirmClick() {
    if (!pendingCell) return;
    const { r, c } = pendingCell;
    pendingCell = null;

    const res = await api("/api/click", {
      method: "POST",
      body: JSON.stringify({ row: r, col: c }),
    });

    renderBoard(res.board);

    // check new bingo lines
    const newLines = detectNewBingoLines(res.board);
    if (newLines.length > 0) {
      showModal("🎉 Bingo!", "You completed a row, column, or diagonal!", [
        { label: "OK", handler: () => {} },
      ]);
    }

    if (res.completed) {
      statusEl.textContent = "🎉 Bingo complete! Show your screen at the booth!";
    }
  }

  // --- Preference modal ---
  yesPref.addEventListener("click", async () => {
    await api("/api/preference", {
      method: "POST",
      body: JSON.stringify({ preference: true }),
    });
    prefModal.classList.remove("active");
    sessionStorage.setItem("askedPref", "1");
  });
  noPref.addEventListener("click", async () => {
    await api("/api/preference", {
      method: "POST",
      body: JSON.stringify({ preference: false }),
    });
    prefModal.classList.remove("active");
    sessionStorage.setItem("askedPref", "1");
  });

  // --- New board modal logic ---
  document.getElementById("newBoard").addEventListener("click", () => {
    // clean up any extra buttons first
    newModal.querySelectorAll(".tempBtn").forEach((b) => b.remove());
    newModal.querySelector("h3").textContent = "Start a new board?";
    newModal.querySelector("p").textContent =
      "If you generate a new board now, you won’t receive a prize for the current one.";
    newTimerText.style.display = "";
    confirmNew.style.display = "";
    cancelNew.style.display = "";
    newModal.classList.add("active");

    confirmNew.disabled = true;
    let countdown = 3;
    newTimerText.textContent = `You can confirm in ${countdown}...`;
    const timer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(timer);
        confirmNew.disabled = false;
        newTimerText.textContent = "You may now confirm.";
      } else {
        newTimerText.textContent = `You can confirm in ${countdown}...`;
      }
    }, 1000);
  });

  cancelNew.addEventListener("click", () =>
    newModal.classList.remove("active")
  );

  confirmNew.addEventListener("click", async () => {
    const res = await api("/api/newboard", { method: "POST" });
    if (res.ok) {
      completedRows.clear();
      completedCols.clear();
      completedDiags.clear();
      renderBoard(res.board);
      statusEl.textContent = "New board generated. Prize eligibility reset.";
    }
    newModal.classList.remove("active");
  });

  // --- Buttons ---
  document.getElementById("reset").addEventListener("click", async () => {
    const { board } = await api("/api/board");
    completedRows.clear();
    completedCols.clear();
    completedDiags.clear();
    renderBoard(board);
  });

  document.getElementById("screenshot").addEventListener("click", () => {
    import(
      "https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.esm.js"
    )
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
  });

  // --- Initial load ---
  const { board, meta } = await api("/api/board");
  completedRows.clear();
  completedCols.clear();
  completedDiags.clear();
  renderBoard(board);
  if (meta && !sessionStorage.getItem("askedPref"))
    prefModal.classList.add("active");
})();
