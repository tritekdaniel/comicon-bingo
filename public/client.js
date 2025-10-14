(async function () {
  const boardEl = document.getElementById("board");

  const confirmModal = document.getElementById("confirmModal");
  const confirmOk = document.getElementById("confirmOk");
  const confirmCancel = document.getElementById("confirmCancel");
  const bingoModal = document.getElementById("bingoModal");
  const bingoOk = document.getElementById("bingoOk");
  const bingoText = document.getElementById("bingoText");
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

  const highlightLine = (type, index) => {
    const SIZE = 5;
    const cells = boardEl.querySelectorAll(".cell");
    if (type === "r")
      for (let c = 0; c < SIZE; c++)
        cells[index * SIZE + c].classList.add("highlight");
    if (type === "c")
      for (let r = 0; r < SIZE; r++)
        cells[r * SIZE + index].classList.add("highlight");
    if (type === "d1")
      for (let i = 0; i < SIZE; i++) cells[i * SIZE + i].classList.add("highlight");
    if (type === "d2")
      for (let i = 0; i < SIZE; i++)
        cells[i * SIZE + (SIZE - 1 - i)].classList.add("highlight");
  };

  const checkBingo = (board) => {
    const SIZE = 5;
    const bingos = [];

    for (let i = 0; i < SIZE; i++) {
      if (board[i].every((sq) => sq.clicked)) bingos.push("r" + i);
      if (board.every((r) => r[i].clicked)) bingos.push("c" + i);
    }
    if (board.every((_, i) => board[i][i].clicked)) bingos.push("d1");
    if (board.every((_, i) => board[i][SIZE - 1 - i].clicked)) bingos.push("d2");
    return bingos;
  };

  const getBingoDirectionText = (code) => {
    if (code.startsWith("r")) return "Horizontal Bingo!";
    if (code.startsWith("c")) return "Vertical Bingo!";
    if (code === "d1" || code === "d2") return "Diagonal Bingo!";
    return "Bingo!";
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
        highlightLine(b[0], parseInt(b.slice(1)) || b);
        bingoText.textContent = "🎉 " + getBingoDirectionText(b);
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

  bingoOk.addEventListener("click", () => bingoModal.classList.remove("active"));
  completeOk.addEventListener("click", () => completeModal.classList.remove("active"));

  const takeScreenshot = () => {
    import("https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm")
      .then(({ toPng }) => toPng(boardEl))
      .then((dataUrl) => {
        const link = document.createElement("a");
        link.download = "bingo.png";
        link.href = dataUrl;
        link.click();
      })
      .catch(() => alert("Screenshot failed — ensure images are same-origin."));
  };
  completeScreenshot.addEventListener("click", takeScreenshot);
  document.getElementById("screenshot").addEventListener("click", takeScreenshot);

  const { board } = await api("/api/board");
  renderBoard(board);
})();
