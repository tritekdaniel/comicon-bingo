(async function () {
  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");

  // Modals
  const prefModal = document.getElementById("prefModal");
  const yesPref = document.getElementById("yesPref");
  const noPref = document.getElementById("noPref");

  const newModal = document.getElementById("newModal");
  const confirmNew = document.getElementById("confirmNew");
  const cancelNew = document.getElementById("cancelNew");
  const newTimerText = document.getElementById("newTimerText");

  const confirmModal = document.getElementById("confirmModal");
  const confirmText = document.getElementById("confirmText");
  const confirmOk = document.getElementById("confirmOk");
  const confirmCancel = document.getElementById("confirmCancel");

  const bingoModal = document.getElementById("bingoModal");
  const bingoOk = document.getElementById("bingoOk");

  const completeModal = document.getElementById("completeModal");
  const completeOk = document.getElementById("completeOk");
  const screenshotBtn = document.getElementById("screenshotBtn");

  let pendingAction = null;
  let currentBoard = null;
  let completedRows = new Set();

  // API helper
  const api = async (path, opts = {}) => {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    return res.json();
  };

  // Render board
  const renderBoard = (board) => {
    currentBoard = board;
    boardEl.innerHTML = "";
    board.forEach((row, r) => {
      row.forEach((cell, c) => {
        const div = document.createElement("div");
        div.className = "cell";
        if (cell.clicked) div.classList.add("clicked");
        if (cell.fixed) div.classList.add("fixed");
        div.dataset.r = r;
        div.dataset.c = c;

        if (cell.clicked && cell.image) {
          div.innerHTML = `<img src="${cell.image}" alt="${cell.text}">`;
        } else {
          div.textContent = cell.text;
        }

        div.addEventListener("click", () => {
          if (cell.fixed) return;
          if (cell.clicked) {
            confirmAction("Unmark this square?", () => clickCell(r, c));
          } else {
            confirmAction("Mark this square?", () => clickCell(r, c));
          }
        });

        boardEl.appendChild(div);
      });
    });
  };

  // Check for Bingo (rows, columns, diagonals)
  const checkBingo = (board) => {
    const size = 5;
    const bingos = [];

    // Rows
    for (let r = 0; r < size; r++) {
      if (board[r].every((c) => c.clicked)) bingos.push(`r${r}`);
    }

    // Columns
    for (let c = 0; c < size; c++) {
      if (board.every((r) => r[c].clicked)) bingos.push(`c${c}`);
    }

    // Diagonals
    if ([0, 1, 2, 3, 4].every((i) => board[i][i].clicked)) bingos.push("d1");
    if ([0, 1, 2, 3, 4].every((i) => board[i][4 - i].clicked)) bingos.push("d2");

    return bingos;
  };

  // Handle click on a cell
  const clickCell = async (r, c) => {
    const res = await api("/api/click", {
      method: "POST",
      body: JSON.stringify({ row: r, col: c }),
    });

    renderBoard(res.board);

    const newBingos = checkBingo(res.board).filter((b) => !completedRows.has(b));

    if (newBingos.length > 0) {
      newBingos.forEach((b) => completedRows.add(b));
      bingoModal.classList.add("active");
    }

    if (res.completed) {
      completeModal.classList.add("active");
    }
  };

  // Confirm action modal
  function confirmAction(message, onConfirm) {
    confirmText.textContent = message;
    confirmModal.classList.add("active");

    const cleanup = () => {
      confirmModal.classList.remove("active");
      confirmOk.removeEventListener("click", okHandler);
      confirmCancel.removeEventListener("click", cancelHandler);
    };

    const okHandler = () => {
      cleanup();
      onConfirm();
    };
    const cancelHandler = cleanup;

    confirmOk.addEventListener("click", okHandler);
    confirmCancel.addEventListener("click", cancelHandler);
  }

  // Screenshot function
  function takeScreenshot() {
    const boardEl = document.getElementById("board");
    if (!boardEl) {
      alert("Bingo board not found!");
      return;
    }

    const scale = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 1 : 2;
    const options = {
      pixelRatio: scale,
      backgroundColor: "#0d0d17",
      cacheBust: true,
      filter: (node) => !node.closest(".modal") && node.id !== "status",
    };

    htmlToImage
      .toPng(boardEl, options)
      .then((dataUrl) => {
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isIOS) {
          const newTab = window.open();
          newTab.document.write(`<img src="${dataUrl}" style="width:100%;height:auto;"/>`);
          return;
        }

        const link = document.createElement("a");
        link.download = "bingo-board.png";
        link.href = dataUrl;
        link.click();
      })
      .catch((err) => {
        console.error("Screenshot failed:", err);
        alert("Screenshot failed — try again or use desktop mode.");
      });
  }

  // Button handlers
  bingoOk.addEventListener("click", () => bingoModal.classList.remove("active"));
  completeOk.addEventListener("click", () => completeModal.classList.remove("active"));
  screenshotBtn.addEventListener("click", takeScreenshot);

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

  document.getElementById("newBoard").addEventListener("click", () => {
    newModal.classList.add("active");
    confirmNew.disabled = true;
    let countdown = 3;
    newTimerText.textContent = `You can confirm in ${countdown}...`;

    const interval = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(interval);
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
      renderBoard(res.board);
      statusEl.textContent = "New board generated. Prize eligibility reset.";
    }
    newModal.classList.remove("active");
  });

  document.getElementById("reset").addEventListener("click", loadBoard);

  async function loadBoard() {
    const { board, meta } = await api("/api/board");
    renderBoard(board);
    if (meta && !sessionStorage.getItem("askedPref")) {
      prefModal.classList.add("active");
    }
  }

  await loadBoard();
})();
