(async function () {
  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");

  // Modals
  const warningModal = document.getElementById("warningModal");
  const warningOk = document.getElementById("warningOk");
  const prefModal = document.getElementById("prefModal");
  const yesPref = document.getElementById("yesPref");
  const noPref = document.getElementById("noPref");
  const confirmModal = document.getElementById("confirmModal");
  const confirmOk = document.getElementById("confirmOk");
  const confirmCancel = document.getElementById("confirmCancel");
  const bingoModal = document.getElementById("bingoModal");
  const bingoOk = document.getElementById("bingoOk");
  const completeModal = document.getElementById("completeModal");
  const completeOk = document.getElementById("completeOk");
  const completeScreenshot = document.getElementById("completeScreenshot");

  const api = async (path, opts = {}) => {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    return res.json();
  };

  let currentBoard = null;
  let pendingAction = null;
  let completedBingos = new Set();

  // Render board
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
        div.addEventListener("click", () => handleClick(r, c, cell));
        boardEl.appendChild(div);
      })
    );
  };

  const checkBingo = (board) => {
    const SIZE = 5;
    const bingos = [];

    // Rows & columns
    for (let i = 0; i < SIZE; i++) {
      if (board[i].every((sq) => sq.clicked)) bingos.push("r" + i);
      if (board.every((r) => r[i].clicked)) bingos.push("c" + i);
    }
    // Diagonals
    if (board.every((_, i) => board[i][i].clicked)) bingos.push("d1");
    if (board.every((_, i) => board[i][SIZE - 1 - i].clicked)) bingos.push("d2");
    return bingos;
  };

  const handleClick = (r, c, cell) => {
    if (cell.fixed) return;

    pendingAction = { r, c, cell };
    const isUnmark = cell.clicked;
    document.getElementById("confirmTitle").textContent = isUnmark
      ? "Unmark?"
      : "Mark this square?";
    document.getElementById("confirmMsg").textContent = isUnmark
      ? "Would you like to unmark this square?"
      : "Would you like to mark this square?";
    confirmModal.classList.add("active");
  };

  confirmOk.addEventListener("click", async () => {
    confirmModal.classList.remove("active");
    if (!pendingAction) return;

    const { r, c } = pendingAction;
    const res = await api("/api/click", {
      method: "POST",
      body: JSON.stringify({ row: r, col: c }),
    });

    renderBoard(res.board);

    const newBingos = checkBingo(res.board);
    for (const b of newBingos) {
      if (!completedBingos.has(b)) {
        completedBingos.add(b);
        bingoModal.classList.add("active");
        break;
      }
    }

    if (res.completed) completeModal.classList.add("active");
  });

  confirmCancel.addEventListener("click", () => {
    confirmModal.classList.remove("active");
    pendingAction = null;
  });

  bingoOk.addEventListener("click", () =>
    bingoModal.classList.remove("active")
  );

  completeOk.addEventListener("click", () =>
    completeModal.classList.remove("active")
  );

  const takeScreenshot = () => {
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
  };

  completeScreenshot.addEventListener("click", takeScreenshot);
  document.getElementById("screenshot").addEventListener("click", takeScreenshot);

  // Warning + preference flow
  warningOk.addEventListener("click", () => {
    warningModal.classList.remove("active");
    localStorage.setItem("warningShown", "1");
    prefModal.classList.add("active");
  });

  yesPref.addEventListener("click", async () => {
    await api("/api/preference", {
      method: "POST",
      body: JSON.stringify({ preference: true }),
    });
    sessionStorage.setItem("askedPref", "1");
    prefModal.classList.remove("active");
  });

  noPref.addEventListener("click", async () => {
    await api("/api/preference", {
      method: "POST",
      body: JSON.stringify({ preference: false }),
    });
    sessionStorage.setItem("askedPref", "1");
    prefModal.classList.remove("active");
  });

  const loadBoard = async () => {
    const { board } = await api("/api/board");
    renderBoard(board);
  };

  await loadBoard();

  if (!localStorage.getItem("warningShown")) {
    warningModal.classList.add("active");
  } else if (!sessionStorage.getItem("askedPref")) {
    prefModal.classList.add("active");
  }
})();
