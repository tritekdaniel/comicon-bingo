(async function () {
  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");

  const newModal = document.getElementById("newModal");
  const modalBox = newModal.querySelector(".modal-box");
  const modalTitle = newModal.querySelector("h3");
  const modalMessage = newModal.querySelector("p");
  const newTimerText = document.getElementById("newTimerText");
  const confirmNew = document.getElementById("confirmNew");
  const cancelNew = document.getElementById("cancelNew");

  const prefModal = document.getElementById("prefModal");
  const yesPref = document.getElementById("yesPref");
  const noPref = document.getElementById("noPref");

  let currentBoard = null;
  let pendingCell = null;

  // Tracking sets for completed lines
  let completedRows = new Set();
  let completedCols = new Set();
  let completedDiags = new Set();

  // --- Modal Helper (works with all modals) ---
  function showModal(title, message, buttons) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;

    // Hide default newboard elements
    newTimerText.style.display = "none";
    confirmNew.style.display = "none";
    cancelNew.style.display = "none";

    // Remove any previous temp buttons
    modalBox.querySelectorAll(".tempBtnContainer").forEach((b) => b.remove());

    const btnContainer = document.createElement("div");
    btnContainer.className = "tempBtnContainer";
    btnContainer.style.display = "flex";
    btnContainer.style.justifyContent = "center";
    btnContainer.style.flexWrap = "wrap";
    btnContainer.style.gap = "10px";
    btnContainer.style.marginTop = "0.8rem";

    buttons.forEach(({ label, handler, secondary }) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.className = secondary ? "secondary tempBtn" : "tempBtn";
      btn.addEventListener("click", () => {
        newModal.classList.remove("active");
        handler();
      });
      btnContainer.appendChild(btn);
    });

    modalBox.appendChild(btnContainer);
    newModal.classList.add("active");
  }

  // --- API helper ---
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

        // Skip confirmation for FREE center or clicked squares
        if (!cell.fixed && !cell.clicked) {
          div.addEventListener("click", () => {
            pendingCell = { r, c };
            showModal("Mark this square?", "Are you sure you want to select this square?", [
              { label: "OK", handler: confirmClick },
              { label: "Cancel", handler: () => (pendingCell = null), secondary: true },
            ]);
          });
        }

        boardEl.appendChild(div);
      })
    );
  };

  const isClicked = (sq) => sq.clicked || sq.fixed;

  // --- Detect Bingo lines ---
  function detectNewBingoLines(board) {
    const size = board.length;
    const newLines = [];

    // rows
    for (let r = 0; r < size; r++) {
      if (board[r].every(isClicked) && !completedRows.has(r)) {
        completedRows.add(r);
        newLines.push({ type: "row", index: r });
      }
    }

    // cols
    for (let c = 0; c < size; c++) {
      if (board.every((row) => isClicked(row[c])) && !completedCols.has(c)) {
        completedCols.add(c);
        newLines.push({ type: "col", index: c });
      }
    }

    // diagonals
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

    // Highlight
    newLines.forEach(({ type, index }) => {
      const flash = (selector) => {
        const el = boardEl.querySelector(selector);
        if (el) {
          el.classList.add("highlight");
          setTimeout(() => el.classList.remove("highlight"), 1000);
        }
      };

      if (type === "row") {
        for (let c = 0; c < size; c++) flash(`.cell[data-r="${index}"][data-c="${c}"]`);
      } else if (type === "col") {
        for (let r = 0; r < size; r++) flash(`.cell[data-r="${r}"][data-c="${index}"]`);
      } else if (type === "diagMain") {
        for (let i = 0; i < size; i++) flash(`.cell[data-r="${i}"][data-c="${i}"]`);
      } else if (type === "diagAnti") {
        for (let i = 0; i < size; i++) flash(`.cell[data-r="${i}"][data-c="${size - 1 - i}"]`);
      }
    });

    return newLines.map((l) => l.type);
  }

  // --- Confirm marking a square ---
  async function confirmClick() {
    if (!pendingCell) return;
    const { r, c } = pendingCell;
    pendingCell = null;

    const res = await api("/api/click", {
      method: "POST",
      body: JSON.stringify({ row: r, col: c }),
    });

    renderBoard(res.board);
    const newLines = detectNewBingoLines(res.board);

    if (newLines.length > 0) {
      showModal("🎉 Bingo!", "You completed a row, column, or diagonal!", [
        { label: "OK", handler: () => {} },
      ]);
    }

    if (res.completed) {
      statusEl.textContent = "🎉 Bingo complete! Show your screen at the booth!";
      showModal("🎉 Congratulations!", "Board completed!", [
        { label: "OK", handler: () => {} },
        { label: "Screenshot Board", handler: takeScreenshot },
      ]);
    }
  }

  // --- Screenshot ---
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

  // --- Preference ---
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

  // --- New board modal ---
  document.getElementById("newBoard").addEventListener("click", () => {
    modalBox.querySelectorAll(".tempBtnContainer").forEach((b) => b.remove());
    modalTitle.textContent = "Start a new board?";
    modalMessage.textContent =
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

  cancelNew.addEventListener("click", () => newModal.classList.remove("active"));

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

  document.getElementById("screenshot").addEventListener("click", takeScreenshot);

  // --- Initial Load ---
  const { board, meta } = await api("/api/board");
  completedRows.clear();
  completedCols.clear();
  completedDiags.clear();
  renderBoard(board);
  if (meta && !sessionStorage.getItem("askedPref"))
    prefModal.classList.add("active");
})();
