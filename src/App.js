import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { Peer } from 'peerjs';

// ==========================================
// 1. CONSTANTS & TEXT RESOURCES
// ==========================================

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
    title: "미믹 체스 (Mimic Chess)",
    welcome: "미믹 체스에 오신 것을 환영합니다!",
    localPlay: "혼자하기 (로컬)",
    createRoom: "방 만들기 (온라인)",
    joinRoom: "방 참가하기 (온라인)",
    roomId: "방 ID (상대에게 공유):",
    enterRoomId: "참가할 방 ID 입력:",
    connect: "연결",
    waiting: "상대방 접속 대기 중...",
    connected: "상대방과 연결되었습니다!",
    myTurn: "내 턴",
    oppTurn: "상대 턴",
    currentLogic: "현재 행마 규칙",
    nextLogic: "다음 턴 예약",
    standard: "자유 선택 (1턴)",
    rules: {
      title: "📜 게임 규칙",
      core: "3턴부터, 직전 턴에 본인이 움직였던 기물의 행마법을 따라야 합니다.",
      pawn: "폰 행마 시, 움직인 적 없는 기물은 2칸 전진 가능.",
      win: "상대 킹을 잡으면 승리합니다.",
    },
    status: {
      white: "백 (White)",
      black: "흑 (Black)",
      check: "체크!",
      win: "승리!",
      lose: "패배..."
    },
    copy: "복사",
    restart: "다시 하기"
  },
  EN: {
    title: "Mimic Chess",
    welcome: "Welcome to Mimic Chess!",
    localPlay: "Play Local",
    createRoom: "Create Room",
    joinRoom: "Join Room",
    roomId: "Room ID (Share this):",
    enterRoomId: "Enter Room ID:",
    connect: "Connect",
    waiting: "Waiting for opponent...",
    connected: "Connected to opponent!",
    myTurn: "My Turn",
    oppTurn: "Opponent's Turn",
    currentLogic: "Current Move Logic",
    nextLogic: "Next Turn Logic",
    standard: "Free Choice",
    rules: {
      title: "📜 Rules",
      core: "From turn 3, you must mimic the piece YOU moved last turn.",
      pawn: "With Pawn logic, unmoved pieces can dash 2 squares.",
      win: "Capture the King to win.",
    },
    status: {
      white: "White",
      black: "Black",
      check: "Check!",
      win: "You Win!",
      lose: "You Lose..."
    },
    copy: "Copy",
    restart: "Restart"
  }
};

// ==========================================
// 2. HELPER FUNCTIONS (ENGINE)
// ==========================================

const COLS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const ROWS = ['1', '2', '3', '4', '5', '6', '7', '8'];

const toCoords = (sq) => ({ x: COLS.indexOf(sq[0]), y: ROWS.indexOf(sq[1]) });
const toSquare = (x, y) => (x >= 0 && x < 8 && y >= 0 && y < 8) ? COLS[x] + ROWS[y] : null;

// Get piece from FEN (using chess.js as parser only)
const getPiece = (fen, sq) => new Chess(fen).get(sq);

// ==========================================
// 3. MAIN COMPONENT
// ==========================================

export default function App() {
  const [lang, setLang] = useState('KO'); // 'KO' | 'EN'
  const t = TEXTS[lang];

  // Game State
  const [game, setGame] = useState(new Chess()); // Only for FEN management
  const [fen, setFen] = useState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const [turn, setTurn] = useState('w'); // 'w' | 'b'
  
  // Mimic Logic State
  // historyLog: { w: [pieceType1, pieceType2...], b: [...] }
  const [moveHistory, setMoveHistory] = useState({ w: [], b: [] });
  // unmoved: Track pieces for pawn dash
  const [unmoved, setUnmoved] = useState({});

  // Multiplayer State
  const [mode, setMode] = useState('MENU'); // 'MENU', 'LOCAL', 'ONLINE_HOST', 'ONLINE_JOIN'
  const [myColor, setMyColor] = useState('BOTH'); // 'w', 'b', 'BOTH'
  const [peerId, setPeerId] = useState('');
  const [conn, setConn] = useState(null);
  const [joinId, setJoinId] = useState('');
  const peerRef = useRef(null);

  // UI State
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  const [winner, setWinner] = useState(null);

  // Initialize Unmoved
  useEffect(() => {
    resetGame();
  }, []);

  // --- ENGINE: Calculate Valid Moves ---
  const calculateValidMoves = (square, currentFen, currentTurn, history) => {
    const piece = getPiece(currentFen, square);
    if (!piece || piece.color !== currentTurn) return [];

    const { x: cx, y: cy } = toCoords(square);
    const moves = [];
    const opponent = currentTurn === 'w' ? 'b' : 'w';

    // 1. Determine Logic
    // If it's the player's 1st turn (history length 0), Logic = Piece's own type (Standard)
    // If history length >= 1, Logic = The piece type moved in the LAST turn (Mimic)
    const playerHistory = history[currentTurn];
    let logicType = piece.type; // Default (Standard)
    
    if (playerHistory.length >= 1) {
      logicType = playerHistory[playerHistory.length - 1]; // Last moved piece type
    }

    // Direction Vectors
    const vecs = {
      n: [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]],
      b: [[1,1],[1,-1],[-1,-1],[-1,1]],
      r: [[1,0],[-1,0],[0,1],[0,-1]],
      q: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,-1],[-1,1]],
      k: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,-1],[-1,1]],
    };

    // Helper: Add move if empty or capture
    const tryAdd = (tx, ty) => {
      const ts = toSquare(tx, ty);
      if (!ts) return false; // OOB
      const tp = getPiece(currentFen, ts);
      if (!tp) {
        moves.push(ts);
        return true; // Continue sliding
      } else if (tp.color === opponent) {
        moves.push(ts);
        return false; // Capture & Stop
      }
      return false; // Blocked
    };

    // Logic Implementation
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
      // Move 1
      const f1 = toSquare(cx, cy + dir);
      if (f1 && !getPiece(currentFen, f1)) {
        moves.push(f1);
        // Move 2 (Dash) - if Logic is Pawn AND Piece is unmoved
        const f2 = toSquare(cx, cy + dir*2);
        // Note: Rule says "If current logic is Pawn, any unmoved piece can dash"
        if (unmoved[square] && f2 && !getPiece(currentFen, f2)) {
          moves.push(f2);
        }
      }
      // Capture
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

  // --- ACTION: Execute Move ---
  const handleMove = (from, to) => {
    // 1. Validate Ownership
    const piece = getPiece(fen, from);
    if (!piece || piece.color !== turn) return;
    if (myColor !== 'BOTH' && myColor !== turn) return; // Not my turn in online

    // 2. Execute
    const newFen = applyMoveToFen(fen, from, to);
    if (!newFen) return; // Something wrong

    // 3. Update State
    const nextTurn = turn === 'w' ? 'b' : 'w';
    const newHistory = { ...moveHistory };
    
    // Check Promotion for history Logic
    // Rule: Promotion resets next logic to Pawn
    let recordedType = piece.type;
    const isPromotion = (piece.type === 'p' && (to[1] === '8' || to[1] === '1'));
    if (isPromotion) recordedType = 'p';

    newHistory[turn] = [...newHistory[turn], recordedType];

    // Update Unmoved
    const newUnmoved = { ...unmoved };
    delete newUnmoved[from];

    // Check Win (King Capture)
    const target = getPiece(fen, to);
    let win = null;
    if (target && target.type === 'k') {
      win = turn; // Current player wins
    }

    // Apply State Locally
    updateGameState(newFen, nextTurn, newHistory, newUnmoved, win);

    // Send to Peer if Online
    if (conn && conn.open) {
      conn.send({
        type: 'MOVE',
        data: { fen: newFen, turn: nextTurn, history: newHistory, unmoved: newUnmoved, winner: win }
      });
    }
  };

  const applyMoveToFen = (currentFen, from, to) => {
    const temp = new Chess(currentFen);
    const p = temp.get(from);
    temp.remove(from);
    
    // Promotion always to Queen for power, but Logic resets to Pawn
    let type = p.type;
    if (p.type === 'p' && (to[1] === '1' || to[1] === '8')) type = 'q';
    
    temp.put({ type, color: p.color }, to);
    
    // Manual FEN update for turn
    const tokens = temp.fen().split(' ');
    tokens[1] = p.color === 'w' ? 'b' : 'w';
    return tokens.join(' ');
  };

  const updateGameState = (newFen, newTurn, newHistory, newUnmoved, newWinner) => {
    setFen(newFen);
    setGame(new Chess(newFen));
    setTurn(newTurn);
    setMoveHistory(newHistory);
    setUnmoved(newUnmoved);
    setWinner(newWinner);
    
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
    setGame(new Chess(startFen));
    setTurn('w');
    setMoveHistory({ w: [], b: [] });
    setUnmoved(startUnmoved);
    setWinner(null);
    setSelectedSquare(null);
    setValidMoves([]);
  };

  // --- PEERJS: Networking ---
  useEffect(() => {
    if (mode === 'ONLINE_HOST' && !peerRef.current) {
      const peer = new Peer();
      peer.on('open', (id) => {
        setPeerId(id);
      });
      peer.on('connection', (connection) => {
        setConn(connection);
        setupConnection(connection);
        // Send Initial State
        connection.on('open', () => {
           connection.send({ type: 'SYNC', data: { fen, turn, history: moveHistory, unmoved, winner } });
        });
      });
      peerRef.current = peer;
    }
    
    if (mode === 'ONLINE_JOIN' && !peerRef.current) {
       const peer = new Peer();
       peerRef.current = peer;
       // We wait for user to input ID and click Connect
    }
  }, [mode]);

  const joinGame = () => {
    if (!peerRef.current || !joinId) return;
    const connection = peerRef.current.connect(joinId);
    setConn(connection);
    setupConnection(connection);
  };

  const setupConnection = (connection) => {
    connection.on('data', (data) => {
      if (data.type === 'MOVE' || data.type === 'SYNC') {
        const { fen, turn, history, unmoved, winner } = data.data;
        updateGameState(fen, turn, history, unmoved, winner);
      }
    });
  };

  // --- UI HANDLERS ---
  const onSquareClick = (square) => {
    if (winner) return;
    if (myColor !== 'BOTH' && myColor !== turn) return; // Not your turn

    // Move
    if (selectedSquare && validMoves.includes(square)) {
      handleMove(selectedSquare, square);
      return;
    }

    // Select
    const p = getPiece(fen, square);
    if (p && p.color === turn) {
      setSelectedSquare(square);
      const moves = calculateValidMoves(square, fen, turn, moveHistory);
      setValidMoves(moves);
    } else {
      setSelectedSquare(null);
      setValidMoves([]);
    }
  };

  // Render Helpers
  const getCurrentLogic = (player) => {
    const hist = moveHistory[player];
    if (hist.length === 0) return t.standard;
    const lastType = hist[hist.length - 1];
    return PIECE_NAMES[lastType] ? PIECE_NAMES[lastType][lang] : lastType;
  };

  // --- VIEW: Main Menu ---
  if (mode === 'MENU') {
    return (
      <div style={styles.container}>
        <h1>{t.title}</h1>
        <p>{t.welcome}</p>
        <div style={styles.menu}>
          <button style={styles.btn} onClick={() => { setMode('LOCAL'); setMyColor('BOTH'); }}>{t.localPlay}</button>
          <button style={styles.btn} onClick={() => { setMode('ONLINE_HOST'); setMyColor('w'); }}>{t.createRoom}</button>
          <button style={styles.btn} onClick={() => { setMode('ONLINE_JOIN'); setMyColor('b'); }}>{t.joinRoom}</button>
        </div>
        <div style={{marginTop: 20}}>
           <button onClick={() => setLang(lang === 'KO' ? 'EN' : 'KO')}>{lang === 'KO' ? 'English' : '한국어'}</button>
        </div>
      </div>
    );
  }

  // --- VIEW: Lobby (Host) ---
  if (mode === 'ONLINE_HOST' && !conn) {
    return (
      <div style={styles.container}>
        <h2>{t.createRoom}</h2>
        <p>{t.waiting}</p>
        <div style={styles.box}>
           {t.roomId} <b>{peerId}</b>
           <button onClick={() => navigator.clipboard.writeText(peerId)} style={{marginLeft:10}}>{t.copy}</button>
        </div>
        <button style={styles.backBtn} onClick={() => window.location.reload()}>Back</button>
      </div>
    );
  }

  // --- VIEW: Lobby (Join) ---
  if (mode === 'ONLINE_JOIN' && !conn) {
    return (
      <div style={styles.container}>
        <h2>{t.joinRoom}</h2>
        <input 
          style={styles.input}
          placeholder="Room ID" 
          value={joinId} 
          onChange={e => setJoinId(e.target.value)} 
        />
        <button style={styles.btn} onClick={joinGame}>{t.connect}</button>
        <button style={styles.backBtn} onClick={() => window.location.reload()}>Back</button>
      </div>
    );
  }

  // --- VIEW: Game Board ---
  return (
    <div style={styles.gameContainer}>
      <div style={styles.header}>
         <h3>{t.title}</h3>
         <button onClick={() => setLang(l => l==='KO'?'EN':'KO')}>{lang}</button>
      </div>

      <div style={styles.statusPanel}>
        <div style={{...styles.playerCard, border: turn==='w'?'3px solid gold':'1px solid #ccc'}}>
           <div>{t.status.white} {turn==='w' && '●'}</div>
           <div>Logic: <b>{getCurrentLogic('w')}</b></div>
        </div>
        <div style={{...styles.playerCard, border: turn==='b'?'3px solid gold':'1px solid #ccc'}}>
           <div>{t.status.black} {turn==='b' && '●'}</div>
           <div>Logic: <b>{getCurrentLogic('b')}</b></div>
        </div>
      </div>

      {winner && (
        <div style={styles.winnerOverlay}>
           <h2>{winner === 'w' ? t.status.white : t.status.black} {t.status.win}</h2>
           <button onClick={resetGame}>{t.restart}</button>
        </div>
      )}

      <div style={styles.boardWrapper}>
        <Chessboard 
          position={fen} 
          onSquareClick={onSquareClick}
          customSquareStyles={getSquareStyles(validMoves, selectedSquare, fen)}
          boardOrientation={myColor === 'b' ? 'black' : 'white'}
        />
      </div>

      <div style={styles.rules}>
         <h4>{t.rules.title}</h4>
         <ul>
           <li>{t.rules.core}</li>
           <li>{t.rules.pawn}</li>
           <li>{t.rules.win}</li>
         </ul>
         {mode !== 'LOCAL' && <div style={{color:'blue'}}>{conn ? t.connected : t.waiting}</div>}
      </div>
    </div>
  );
}

// STYLES
const getSquareStyles = (moves, selected, fen) => {
  const s = {};
  moves.forEach(m => {
     const p = getPiece(fen, m);
     s[m] = { 
       background: p ? 'radial-gradient(circle, rgba(255,0,0,0.5) 20%, transparent 20%)' 
                     : 'radial-gradient(circle, rgba(0,0,0,0.2) 20%, transparent 20%)',
       borderRadius: '50%'
     };
  });
  if(selected) s[selected] = { background: 'rgba(255, 255, 0, 0.4)' };
  return s;
};

const styles = {
  container: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'sans-serif', gap: 20 },
  gameContainer: { display:'flex', flexDirection:'column', alignItems:'center', padding:20, fontFamily:'sans-serif' },
  menu: { display:'flex', flexDirection:'column', gap: 10 },
  btn: { padding: '10px 20px', fontSize: '1rem', cursor: 'pointer', background:'#333', color:'#fff', border:'none', borderRadius:5 },
  backBtn: { marginTop: 20, cursor:'pointer', background:'transparent', border:'none', textDecoration:'underline' },
  box: { padding: 20, background: '#eee', borderRadius: 5 },
  input: { padding: 10, fontSize: '1rem', marginBottom: 10 },
  header: { display:'flex', justifyContent:'space-between', width:'100%', maxWidth:500, marginBottom:10 },
  statusPanel: { display:'flex', gap:20, marginBottom:10, width:'100%', maxWidth:500 },
  playerCard: { flex:1, padding:10, borderRadius:8, background:'#f9f9f9', textAlign:'center' },
  boardWrapper: { width:'100%', maxWidth:500, height:'auto' },
  rules: { marginTop:20, maxWidth:500, fontSize:'0.9rem', lineHeight:1.5, background:'#fff', padding:15, borderRadius:8, boxShadow:'0 2px 5px rgba(0,0,0,0.1)' },
  winnerOverlay: { position:'absolute', top:'40%', background:'rgba(0,0,0,0.8)', color:'#fff', padding:30, borderRadius:10, zIndex:100, textAlign:'center' }
};
