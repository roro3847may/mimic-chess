import React, { useState, useEffect, useRef } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { Peer } from 'peerjs';

// --- 상수 및 리소스 ---

const PIECE_NAMES = {
  p: { KO: '폰', EN: 'Pawn' },
  n: { KO: '나이트', EN: 'Knight' },
  b: { KO: '비숍', EN: 'Bishop' },
  r: { KO: '룩', EN: 'Rook' },
  q: { KO: '퀸', EN: 'Queen' },
  k: { KO: '킹', EN: 'King' }
};

const TEXTS = {
  KO: {
    title: "미믹 체스",
    welcome: "미믹 체스에 오신 것을 환영합니다!",
    localPlay: "혼자하기 (로컬)",
    createRoom: "방 만들기",
    joinRoom: "방 참가하기",
    roomId: "방 ID (복사해서 친구에게 공유):",
    enterRoomId: "참가할 방 ID 입력:",
    connect: "입장하기",
    waiting: "상대방 접속 대기 중...",
    connected: "연결되었습니다! 게임 시작!",
    status: {
      white: "백 (White)",
      black: "흑 (Black)",
      win: "승리!",
      lose: "패배...",
      yourTurn: "당신의 턴입니다!",
      oppTurn: "상대방의 턴입니다..."
    },
    rules: {
      btn: "규칙 보기",
      content: "3턴부터 직전 턴에 자신이 움직인 기물의 행마를 따라야 합니다. (폰 행마 시 미이동 기물 2칸 전진 가능)"
    },
    copy: "복사",
    copied: "복사됨!",
    restart: "메인으로",
    langBtn: "English"
  },
  EN: {
    title: "Mimic Chess",
    welcome: "Welcome to Mimic Chess!",
    localPlay: "Play Local",
    createRoom: "Create Room",
    joinRoom: "Join Room",
    roomId: "Room ID (Share this):",
    enterRoomId: "Enter Room ID:",
    connect: "Join",
    waiting: "Waiting for opponent...",
    connected: "Connected! Game Start!",
    status: {
      white: "White",
      black: "Black",
      win: "You Win!",
      lose: "You Lose...",
      yourTurn: "Your Turn!",
      oppTurn: "Opponent's Turn..."
    },
    rules: {
      btn: "Rules",
      content: "From turn 3, you must mimic the piece YOU moved last turn. (Unmoved pieces can dash 2 squares with Pawn Logic)"
    },
    copy: "Copy",
    copied: "Copied!",
    restart: "Main Menu",
    langBtn: "한국어"
  }
};

// --- 엔진 헬퍼 ---
const COLS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const ROWS = ['1', '2', '3', '4', '5', '6', '7', '8'];
const toCoords = (sq) => ({ x: COLS.indexOf(sq[0]), y: ROWS.indexOf(sq[1]) });
const toSquare = (x, y) => (x >= 0 && x < 8 && y >= 0 && y < 8) ? COLS[x] + ROWS[y] : null;
const getPiece = (fen, sq) => {
  try {
    return new Chess(fen).get(sq);
  } catch(e) { return null; }
};

export default function App() {
  const [lang, setLang] = useState('KO');
  const t = TEXTS[lang];

  // Game Logic State
  const [fen, setFen] = useState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const [turn, setTurn] = useState('w');
  const [moveHistory, setMoveHistory] = useState({ w: [], b: [] });
  const [unmoved, setUnmoved] = useState({});
  const [winner, setWinner] = useState(null);

  // Networking State
  const [mode, setMode] = useState('MENU');
  const [myColor, setMyColor] = useState('BOTH');
  const [peerId, setPeerId] = useState('');
  const [conn, setConn] = useState(null);
  const [joinId, setJoinId] = useState('');
  const peerRef = useRef(null);

  // UI State
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  const [showRules, setShowRules] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // 초기화
  useEffect(() => {
    resetGame();
    // Cleanup Peer on unmount
    return () => {
      if(peerRef.current) peerRef.current.destroy();
    }
  }, []);

  // --- ENGINE: 유효 이동 계산 ---
  const calculateValidMoves = (square, currentFen, currentTurn, history) => {
    const piece = getPiece(currentFen, square);
    if (!piece || piece.color !== currentTurn) return [];

    const { x: cx, y: cy } = toCoords(square);
    const moves = [];
    const opponent = currentTurn === 'w' ? 'b' : 'w';

    const playerHistory = history[currentTurn];
    let logicType = piece.type; 
    if (playerHistory && playerHistory.length >= 1) {
      logicType = playerHistory[playerHistory.length - 1]; 
    }

    const vecs = {
      n: [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]],
      b: [[1,1],[1,-1],[-1,-1],[-1,1]],
      r: [[1,0],[-1,0],[0,1],[0,-1]],
      q: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,-1],[-1,1]],
      k: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,-1],[-1,1]],
    };

    const tryAdd = (tx, ty) => {
      const ts = toSquare(tx, ty);
      if (!ts) return false;
      const tp = getPiece(currentFen, ts);
      if (!tp) {
        moves.push(ts);
        return true; 
      } else if (tp.color === opponent) {
        moves.push(ts);
        return false; 
      }
      return false; 
    };

    const l = logicType.toLowerCase();

    if (['b','r','q'].includes(l)) {
      vecs[l].forEach(([dx, dy]) => {
        let tx = cx + dx, ty = cy + dy;
        while(tryAdd(tx, ty)) { tx += dx; ty += dy; }
      });
    }
    if (l === 'n' || l === 'k') {
      vecs[l].forEach(([dx, dy]) => tryAdd(cx + dx, cy + dy));
    }
    if (l === 'p') {
      const dir = currentTurn === 'w' ? 1 : -1;
      const f1 = toSquare(cx, cy + dir);
      if (f1 && !getPiece(currentFen, f1)) {
        moves.push(f1);
        const f2 = toSquare(cx, cy + dir*2);
        if (unmoved[square] && f2 && !getPiece(currentFen, f2)) {
          moves.push(f2);
        }
      }
      [[1,dir], [-1,dir]].forEach(([dx, dy]) => {
        const ts = toSquare(cx+dx, cy+dy);
        if(ts) {
          const tp = getPiece(currentFen, ts);
          if(tp && tp.color === opponent) moves.push(ts);
        }
      });
    }
    return moves;
  };

  const handleMove = (from, to) => {
    const piece = getPiece(fen, from);
    if (!piece || piece.color !== turn) return;
    if (myColor !== 'BOTH' && myColor !== turn) return;

    // Apply Move
    const temp = new Chess(fen);
    temp.remove(from);
    let type = piece.type;
    // Promotion always Queen visually, but Logic resets to Pawn
    if (piece.type === 'p' && (to[1] === '1' || to[1] === '8')) type = 'q';
    temp.put({ type, color: piece.color }, to);
    
    // Update FEN manually
    const tokens = temp.fen().split(' ');
    tokens[1] = piece.color === 'w' ? 'b' : 'w';
    const newFen = tokens.join(' ');

    // Update History
    let recordedType = piece.type;
    if (piece.type === 'p' && (to[1] === '8' || to[1] === '1')) recordedType = 'p';
    
    const newHistory = { ...moveHistory };
    if (!newHistory[turn]) newHistory[turn] = [];
    newHistory[turn] = [...newHistory[turn], recordedType];

    const newUnmoved = { ...unmoved };
    delete newUnmoved[from];

    // Win Check
    const target = getPiece(fen, to);
    let newWinner = null;
    if (target && target.type === 'k') {
      newWinner = turn;
    }

    updateGameState(newFen, tokens[1], newHistory, newUnmoved, newWinner);

    if (conn && conn.open) {
      conn.send({
        type: 'MOVE',
        data: { fen: newFen, turn: tokens[1], history: newHistory, unmoved: newUnmoved, winner: newWinner }
      });
    }
  };

  const updateGameState = (f, t, h, u, w) => {
    setFen(f);
    setTurn(t);
    setMoveHistory(h);
    setUnmoved(u);
    setWinner(w);
    setSelectedSquare(null);
    setValidMoves([]);
  };

  const resetGame = () => {
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const startUnmoved = {};
    ['a','b','c','d','e','f','g','h'].forEach(c => {
      ['1','2','7','8'].forEach(r => {
        const sq = c+r;
        const p = getPiece(startFen, sq);
        if(p) startUnmoved[sq] = true;
      });
    });
    setFen(startFen);
    setTurn('w');
    setMoveHistory({ w: [], b: [] });
    setUnmoved(startUnmoved);
    setWinner(null);
    setSelectedSquare(null);
    setValidMoves([]);
  };

  // --- PEERJS ---
  useEffect(() => {
    if (mode === 'ONLINE_HOST' && !peerRef.current) {
      const peer = new Peer();
      peer.on('open', (id) => setPeerId(id));
      peer.on('connection', (c) => {
        setConn(c);
        c.on('data', (d) => { if(d.type==='MOVE' || d.type==='SYNC') updateGameState(d.data.fen, d.data.turn, d.data.history, d.data.unmoved, d.data.winner); });
        c.on('open', () => c.send({ type: 'SYNC', data: { fen, turn, history: moveHistory, unmoved, winner } }));
      });
      peerRef.current = peer;
    }
    if (mode === 'ONLINE_JOIN' && !peerRef.current) {
       const peer = new Peer();
       peerRef.current = peer;
    }
  }, [mode]);

  const joinGame = () => {
    if (!peerRef.current || !joinId) return;
    const c = peerRef.current.connect(joinId);
    setConn(c);
    c.on('data', (d) => { if(d.type==='MOVE' || d.type==='SYNC') updateGameState(d.data.fen, d.data.turn, d.data.history, d.data.unmoved, d.data.winner); });
  };

  // --- UI Handlers ---
  const onSquareClick = (square) => {
    if (winner || (myColor !== 'BOTH' && myColor !== turn)) return;
    if (selectedSquare && validMoves.includes(square)) {
      handleMove(selectedSquare, square);
      return;
    }
    const p = getPiece(fen, square);
    if (p && p.color === turn) {
      setSelectedSquare(square);
      setValidMoves(calculateValidMoves(square, fen, turn, moveHistory));
    } else {
      setSelectedSquare(null);
      setValidMoves([]);
    }
  };

  const getLogicName = (player) => {
    const h = moveHistory[player];
    if (!h || h.length === 0) return PIECE_NAMES[player === 'w' ? 'p' : 'n'][lang]; // Just display fallback or standard
    const type = h[h.length - 1];
    return PIECE_NAMES[type] ? PIECE_NAMES[type][lang] : type.toUpperCase();
  };

  // --- RENDER ---
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 600;

  // 1. MENU
  if (mode === 'MENU') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>{t.title}</h1>
          <p style={{marginBottom: 30}}>{t.welcome}</p>
          <div style={styles.menuGrid}>
            <button style={styles.menuBtn} onClick={() => { setMode('LOCAL'); setMyColor('BOTH'); resetGame(); }}>🕹️ {t.localPlay}</button>
            <button style={styles.menuBtn} onClick={() => { setMode('ONLINE_HOST'); setMyColor('w'); resetGame(); }}>🏠 {t.createRoom}</button>
            <button style={styles.menuBtn} onClick={() => { setMode('ONLINE_JOIN'); setMyColor('b'); resetGame(); }}>🚀 {t.joinRoom}</button>
          </div>
          <button style={styles.langBtn} onClick={() => setLang(lang === 'KO' ? 'EN' : 'KO')}>🌐 {t.langBtn}</button>
        </div>
      </div>
    );
  }

  // 2. LOBBY
  if ((mode === 'ONLINE_HOST' || mode === 'ONLINE_JOIN') && !conn) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2>{mode === 'ONLINE_HOST' ? t.createRoom : t.joinRoom}</h2>
          {mode === 'ONLINE_HOST' ? (
            <div style={styles.lobbyBox}>
              <p>{t.waiting}</p>
              <div style={styles.codeBox}>
                <span>{peerId || 'Loading...'}</span>
                <button onClick={() => { navigator.clipboard.writeText(peerId); setCopyFeedback(true); setTimeout(()=>setCopyFeedback(false), 2000); }}>
                  {copyFeedback ? t.copied : t.copy}
                </button>
              </div>
            </div>
          ) : (
            <div style={styles.lobbyBox}>
              <input style={styles.input} placeholder="Room ID" value={joinId} onChange={e => setJoinId(e.target.value)} />
              <button style={styles.actionBtn} onClick={joinGame}>{t.connect}</button>
            </div>
          )}
          <button style={styles.textBtn} onClick={() => window.location.reload()}>{t.restart}</button>
        </div>
      </div>
    );
  }

  // 3. GAME
  return (
    <div style={styles.gameContainer}>
      {/* Top Bar */}
      <div style={styles.topBar}>
        <button style={styles.smallBtn} onClick={() => window.location.reload()}>⬅</button>
        <span style={{fontWeight:'bold'}}>{t.title}</span>
        <button style={styles.smallBtn} onClick={() => setShowRules(!showRules)}>❓</button>
      </div>

      {/* Rules Overlay */}
      {showRules && (
        <div style={styles.overlay} onClick={() => setShowRules(false)}>
          <div style={styles.modal}>
            <h3>{t.rules.btn}</h3>
            <p>{t.rules.content}</p>
          </div>
        </div>
      )}

      {/* Winner Overlay */}
      {winner && (
        <div style={styles.overlay}>
          <div style={{...styles.modal, borderColor: '#ffd700', borderWidth: 3}}>
            <h2 style={{fontSize: '2rem'}}>🏆 {winner === 'w' ? t.status.white : t.status.black} {t.status.win}</h2>
            <button style={styles.actionBtn} onClick={() => window.location.reload()}>{t.restart}</button>
          </div>
        </div>
      )}

      {/* Opponent Info */}
      <div style={{...styles.playerInfo, opacity: turn === (myColor === 'w' ? 'b' : 'w') ? 1 : 0.5}}>
        <span>{myColor === 'w' ? t.status.black : t.status.white}</span>
        <span style={styles.badge}>{moveHistory[myColor === 'w' ? 'b' : 'w'] ? getLogicName(myColor === 'w' ? 'b' : 'w') : t.standard}</span>
      </div>

      {/* Board Area */}
      <div style={styles.boardArea}>
        <Chessboard 
          position={fen} 
          onSquareClick={onSquareClick}
          boardOrientation={myColor === 'b' ? 'black' : 'white'}
          customSquareStyles={getSquareStyles(validMoves, selectedSquare, fen)}
        />
      </div>

      {/* My Info */}
      <div style={{...styles.playerInfo, opacity: turn === myColor || myColor === 'BOTH' ? 1 : 0.5, marginTop: 10}}>
        <span>{myColor === 'w' ? t.status.white : (myColor === 'b' ? t.status.black : (turn === 'w' ? t.status.white : t.status.black))}</span>
        <span style={{...styles.badge, background: '#007bff', color: '#fff'}}>
          {moveHistory[turn] ? getLogicName(turn) : t.standard}
        </span>
      </div>
      
      <div style={styles.turnIndicator}>
        {turn === myColor || myColor === 'BOTH' ? (turn === 'w' ? "⬜ White's Turn" : "⬛ Black's Turn") : t.status.oppTurn}
      </div>

    </div>
  );
}

// STYLES
const getSquareStyles = (moves, selected, fen) => {
  const s = {};
  if(moves) {
      moves.forEach(m => {
        const p = getPiece(fen, m);
        s[m] = { 
          background: p ? 'radial-gradient(circle, rgba(255,0,0,0.6) 40%, transparent 40%)' 
                        : 'radial-gradient(circle, rgba(0,0,0,0.2) 20%, transparent 20%)',
        };
      });
  }
  if(selected) s[selected] = { backgroundColor: 'rgba(255, 215, 0, 0.5)' };
  return s;
};

const styles = {
  container: { height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', padding: 20 },
  card: { background: '#fff', padding: 30, borderRadius: 20, boxShadow: '0 4px 15px rgba(0,0,0,0.1)', width: '100%', maxWidth: 400, textAlign: 'center' },
  title: { fontSize: '1.8rem', margin: '0 0 10px 0', color: '#333' },
  menuGrid: { display: 'flex', flexDirection: 'column', gap: 15 },
  menuBtn: { padding: 15, fontSize: '1.1rem', border: 'none', borderRadius: 12, background: '#333', color: '#fff', cursor: 'pointer', fontWeight: 'bold' },
  langBtn: { marginTop: 20, background: 'transparent', border: '1px solid #ddd', padding: '8px 15px', borderRadius: 20, cursor: 'pointer' },
  
  gameContainer: { height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#fff' },
  topBar: { width: '100%', display: 'flex', justifyContent: 'space-between', padding: '15px 20px', alignItems: 'center', background: '#f8f9fa', borderBottom: '1px solid #eee' },
  smallBtn: { background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer' },
  
  boardArea: { width: '100vw', maxWidth: '500px', aspectRatio: '1/1', padding: 10 },
  playerInfo: { width: '90%', maxWidth: '480px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', background: '#f8f9fa', borderRadius: 10, margin: '5px 0' },
  badge: { padding: '5px 10px', borderRadius: 15, background: '#eee', fontSize: '0.9rem', fontWeight: 'bold' },
  turnIndicator: { marginTop: 10, fontSize: '1.2rem', fontWeight: 'bold', color: '#333' },
  
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  modal: { background: '#fff', padding: 30, borderRadius: 15, width: '80%', maxWidth: 350, textAlign: 'center' },
  
  lobbyBox: { margin: '20px 0', textAlign: 'left' },
  codeBox: { display: 'flex', justifyContent: 'space-between', background: '#f1f3f5', padding: 10, borderRadius: 8, marginTop: 5, alignItems: 'center' },
  input: { width: '100%', padding: 12, borderRadius: 8, border: '1px solid #ddd', marginBottom: 10, fontSize: '1rem' },
  actionBtn: { width: '100%', padding: 12, background: '#007bff', color: '#fff', border: 'none', borderRadius: 8, fontSize: '1rem', cursor: 'pointer' },
  textBtn: { background: 'transparent', border: 'none', color: '#666', marginTop: 15, cursor: 'pointer', textDecoration: 'underline' }
};
