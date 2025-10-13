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
  const confirmMsg = document.getElementById("confirmMsg");
  const confirmOk = document.getElementById("confirmOk");
  const confirmCancel = document.getElementById("confirmCancel");

  const bingoModal = document.getElementById("bingoModal");
  const bingoOk = document.getElementById("bingoOk");

  const completeModal = document.getElementById("completeModal");
  const completeOk = document.getElementById("completeOk");
  const completeScreenshot = document.getElementById("completeScreenshot");

  const screenshotBtn = document.getElementById("screenshot");

  let currentBoard = null;
  let completedLines = new Set();

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
        div.innerHTML =
          cell.clicked && cell.image
            ? `<img src="${cell.image}" alt="${cell.text}">`
            : cell.text;

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

  // Confirm modal
  function confirmAction(message, onConfirm) {
    confirmMsg.textContent = message;
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

  // Check bingo (rows, columns, diagonals)
  const checkBingo = (board) => {
    const size = 5;
    const newWins = [];

    // Rows
    for (let r = 0; r < size; r++) {
      if (board[r].every((c) => c.clicked)) newWins.push(`r${r}`);
    }

    // Columns
    for (let c = 0; c < size; c++) {
      if (board.every((r) => r[c].clicked)) newWins.push(`c${c}`);
    }

    // Diagonals
    if ([0, 1, 2, 3, 4].every((i) => board[i][i].clicked)) newWins.push("d1");
    if ([0, 1, 2, 3, 4].every((i) => board[i][4 - i].clicked)) newWins.push("d2");

    return newWins;
  };

  // Flash highlight effect
  const flashLine = (line) => {
    const size = 5;
    const cells = [];

    if (line.startsWith("r")) {
      const r = parseInt(line[1]);
      for (let c = 0; c < size; c++) cells.push(document.querySelector(`[data-r="${r}"][data-c="${c}"]`));
    } else if (line.startsWith("c")) {
      const c = parseInt(line[1]);
      for (let r = 0; r < size; r++) cells.push(document.querySelector(`[data-r="${r}"][data-c="${c}"]`));
    } else if (line === "d1") {
      for (let i = 0; i < size; i++) cells.push(document.querySelector(`[data-r="${i}"][data-c="${i}"]`));
    } else if (line === "d2") {
      for (let i = 0; i < size; i++) cells.push(document.querySelector(`[data-r="${i}"][data-c="${4 - i}"]`));
    }

    cells.forEach((el) => el?.classList.add("flash"));
    setTimeout(() => cells.forEach((el) => el?.classList.remove("flash")), 600);
  };

  // Click handler
  const clickCell = async (r, c) => {
    const res = await api("/api/click", {
      method: "POST",
      body: JSON.stringify({ row: r, col: c }),
    });

    renderBoard(res.board);

    const newWins = checkBingo(res.board).filter((w) => !completedLines.has(w));
    if (newWins.length > 0) {
      newWins.forEach((w) => {
        completedLines.add(w);
        flashLine(w);
      });
      bingoModal.classList.add("active");
    }

    if (res.completed) {
      completeModal.classList.add("active");
    }
  };

  // Screenshot
  function takeScreenshot() {
    const boardEl = document.getElementById("board");
    if (!boardEl) return alert("Bingo board not found!");

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
  completeScreenshot.addEventListener("click", takeScreenshot);
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
