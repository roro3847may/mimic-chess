import React, { useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js'; // FEN 파싱 및 보드 상태 관리용으로만 사용

// --- 상수 및 리소스 ---
const PIECES = {
  p: '폰 (Pawn)', n: '나이트 (Knight)', b: '비숍 (Bishop)', 
  r: '룩 (Rook)', q: '퀸 (Queen)', k: '킹 (King)'
};

const COLS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const ROWS = ['1', '2', '3', '4', '5', '6', '7', '8'];

// --- 커스텀 엔진 헬퍼 함수 ---

// 좌표 변환 (e.g. 'a1' -> {x:0, y:0})
const toCoords = (square) => ({
  x: COLS.indexOf(square[0]),
  y: ROWS.indexOf(square[1])
});

// 좌표 역변환 (e.g. {x:0, y:0} -> 'a1')
const toSquare = (x, y) => {
  if (x < 0 || x > 7 || y < 0 || y > 7) return null;
  return COLS[x] + ROWS[y];
};

// 보드 상태 파싱 (FEN -> 2D Array)
const getBoardFromFen = (fen) => {
  const chess = new Chess(fen);
  const board = [];
  for(let y=0; y<8; y++) {
    for(let x=0; x<8; x++) {
      const square = toSquare(x, 7-y); // chess.js board index is inverted rank
      board.push({ square, piece: chess.get(square) });
    }
  }
  return board; // array of { square: 'a8', piece: { type: 'r', color: 'b' } | null }
};

// 기물 가져오기
const getPieceAt = (fen, square) => {
  const chess = new Chess(fen);
  return chess.get(square);
};

export default function App() {
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  
  // 게임 상태
  const [turn, setTurn] = useState('w');
  const [moveLogics, setMoveLogics] = useState({ w: 'STANDARD', b: 'STANDARD' });
  const [history, setHistory] = useState([]); // { from, to, piece, logic }
  const [unmoved, setUnmoved] = useState({}); // { 'a2': true, ... } -> 초기 위치 기물 추적용
  
  // UI 상태
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [validMoves, setValidMoves] = useState([]); // 현재 선택된 기물의 이동 가능 칸들
  const [winner, setWinner] = useState(null);

  // 초기화 (최초 실행 시 모든 기물을 unmoved로 설정)
  useEffect(() => {
    const initialUnmoved = {};
    const tempChess = new Chess();
    const board = tempChess.board();
    board.forEach(row => {
        row.forEach(piece => {
            if(piece) initialUnmoved[piece.square] = true;
        })
    });
    setUnmoved(initialUnmoved);
  }, []);

  // --- 핵심: 커스텀 이동 검증 엔진 ---
  const calculateValidMoves = (square, logicType) => {
    const piece = getPieceAt(fen, square);
    if (!piece) return [];
    
    const { x: currX, y: currY } = toCoords(square);
    const moves = [];
    const color = piece.color;
    const opponent = color === 'w' ? 'b' : 'w';

    // 방향 벡터 정의
    const directions = {
      n: [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]], // 나이트 (점프)
      b: [[1,1],[1,-1],[-1,-1],[-1,1]], // 비숍 (슬라이딩)
      r: [[1,0],[-1,0],[0,1],[0,-1]], // 룩 (슬라이딩)
      q: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,-1],[-1,1]], // 퀸 (슬라이딩)
      k: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,-1],[-1,1]], // 킹 (1칸)
    };

    const addMoveIfValid = (tx, ty) => {
      const targetSq = toSquare(tx, ty);
      if (!targetSq) return false; // 보드 밖
      const targetPiece = getPieceAt(fen, targetSq);
      
      if (!targetPiece) {
        moves.push(targetSq);
        return true; // 계속 탐색 가능 (슬라이딩인 경우)
      } else if (targetPiece.color === opponent) {
        moves.push(targetSq);
        return false; // 잡고 멈춤
      } else {
        return false; // 내 기물 막힘
      }
    };

    const logic = logicType === 'STANDARD' ? piece.type : logicType;

    // 1. 슬라이딩 기물 (B, R, Q) 처리
    if (['b', 'r', 'q'].includes(logic)) {
      directions[logic].forEach(([dx, dy]) => {
        let tx = currX + dx;
        let ty = currY + dy;
        while (addMoveIfValid(tx, ty)) {
          tx += dx;
          ty += dy;
        }
      });
    }

    // 2. 점프/단발 기물 (N, K) 처리
    if (logic === 'n') {
       directions.n.forEach(([dx, dy]) => addMoveIfValid(currX + dx, currY + dy));
    }
    if (logic === 'k') {
       directions.k.forEach(([dx, dy]) => addMoveIfValid(currX + dx, currY + dy));
    }

    // 3. 폰 (P) 처리 (복잡함)
    if (logic === 'p') {
      const dir = color === 'w' ? 1 : -1;
      
      // (1) 전진 1칸 (빈칸일 때만)
      const f1 = toSquare(currX, currY + dir);
      if (f1 && !getPieceAt(fen, f1)) {
        moves.push(f1);
        
        // (2) 전진 2칸 (특수 룰: "아직 한 번도 움직이지 않았다면")
        // 원래 폰 로직: 2번 랭크/7번 랭크일 때
        // 미믹 룰: unmoved 상태일 때
        const f2 = toSquare(currX, currY + dir * 2);
        if (unmoved[square] && f2 && !getPieceAt(fen, f2) && !getPieceAt(fen, f1)) {
           moves.push(f2);
        }
      }

      // (3) 대각선 공격 (상대 기물 있을 때만)
      [[1, dir], [-1, dir]].forEach(([dx, dy]) => {
        const targetSq = toSquare(currX + dx, currY + dy);
        if (targetSq) {
          const targetPiece = getPieceAt(fen, targetSq);
          if (targetPiece && targetPiece.color === opponent) {
            moves.push(targetSq);
          }
        }
      });
      
      // (4) 앙파상 (구현 생략 - 복잡도 줄임, 필요시 추가)
    }

    return moves;
  };

  // --- 액션 핸들러 ---

  const handleSquareClick = (square) => {
    if (winner) return;

    // 1. 이동 실행 (선택된 칸이 유효 이동 목록에 있을 때)
    if (selectedSquare && validMoves.includes(square)) {
      executeMove(selectedSquare, square);
      return;
    }

    // 2. 기물 선택
    const piece = getPieceAt(fen, square);
    if (piece && piece.color === turn) {
      setSelectedSquare(square);
      // 현재 턴의 행마 규칙 적용
      const logic = moveLogics[turn] === 'STANDARD' ? piece.type : moveLogics[turn];
      const moves = calculateValidMoves(square, logic);
      setValidMoves(moves);
    } else {
      setSelectedSquare(null);
      setValidMoves([]);
    }
  };

  const executeMove = (from, to) => {
    const movingPiece = getPieceAt(fen, from);
    const targetPiece = getPieceAt(fen, to);

    // 승리 조건: 킹 잡기
    if (targetPiece && targetPiece.type === 'k') {
      setWinner(turn === 'w' ? 'White' : 'Black');
    }

    // FEN 조작 (강제 이동)
    const tempGame = new Chess(fen);
    tempGame.remove(from);
    tempGame.put({ type: movingPiece.type, color: movingPiece.color }, to); // 프로모션 로직 추가 필요
    
    // 프로모션 처리 (끝에 닿으면 퀸으로 변신 - 룰 4)
    let isPromotion = false;
    if (movingPiece.type === 'p') {
      if ((movingPiece.color === 'w' && to[1] === '8') || (movingPiece.color === 'b' && to[1] === '1')) {
        tempGame.put({ type: 'q', color: movingPiece.color }, to);
        isPromotion = true;
      }
    }

    // 턴 교체 및 상태 업데이트
    const nextTurn = turn === 'w' ? 'b' : 'w';
    let nextFen = tempGame.fen();
    
    // FEN 문자열에서 턴 정보(두 번째 필드) 수동 교체
    const fenParts = nextFen.split(' ');
    fenParts[1] = nextTurn; 
    nextFen = fenParts.join(' ');

    // 미믹 로직 업데이트
    const nextLogics = { ...moveLogics };
    // 내가 방금 움직인 기물이 나의 '다음' 행마법이 됨
    // (단, 프로모션 직후에는 폰 행마로 리셋 - 룰 4)
    nextLogics[turn] = isPromotion ? 'p' : movingPiece.type;

    setFen(nextFen);
    setGame(new Chess(nextFen));
    setTurn(nextTurn);
    setMoveLogics(nextLogics);
    setHistory([...history, { from, to, piece: movingPiece.type }]);
    
    // 이동했으므로 unmoved 상태 제거
    const newUnmoved = { ...unmoved };
    delete newUnmoved[from];
    setUnmoved(newUnmoved);

    // UI 초기화
    setSelectedSquare(null);
    setValidMoves([]);
  };

  // --- 렌더링 헬퍼 ---
  const getCustomSquareStyles = () => {
    const styles = {};
    validMoves.forEach(sq => {
      styles[sq] = {
        background: getPieceAt(fen, sq) 
          ? 'radial-gradient(circle, rgba(255,0,0,0.5) 20%, transparent 20%)' 
          : 'radial-gradient(circle, rgba(0,0,0,0.2) 20%, transparent 20%)',
        borderRadius: '50%'
      };
    });
    if (selectedSquare) {
      styles[selectedSquare] = { background: 'rgba(255, 255, 0, 0.4)' };
    }
    return styles;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'sans-serif', padding: '20px', background: '#f0f2f5', minHeight: '100vh' }}>
      <h1 style={{ color: '#333' }}>Mimic Chess (Engine v2)</h1>
      
      {/* 상태 표시 패널 */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        <StatusCard player="White" active={turn === 'w'} logic={moveLogics.w} />
        <StatusCard player="Black" active={turn === 'b'} logic={moveLogics.b} />
      </div>

      {winner && <h2 style={{ color: 'red', animation: 'bounce 1s infinite' }}>🏆 {winner} Wins! 🏆</h2>}

      <div style={{ width: '500px', maxWidth: '90vw' }}>
        <Chessboard 
          position={fen} 
          onSquareClick={handleSquareClick}
          customSquareStyles={getCustomSquareStyles()}
          boardOrientation={turn === 'w' ? 'white' : 'black'} // 턴에 따라 보드 회전 (옵션)
        />
      </div>

      <button 
        onClick={() => window.location.reload()}
        style={{ marginTop: '20px', padding: '10px 20px', background: '#333', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
      >
        Restart Game
      </button>

      {/* 룰 설명 */}
      <div style={{ marginTop: '30px', maxWidth: '600px', background: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h3>📜 Rules (엄격 모드 적용됨)</h3>
        <ul style={{ lineHeight: '1.6' }}>
          <li><b>Mimicry:</b> 3턴부터 '직전 턴에 내가 움직인 기물'의 이동 규칙을 따라야 합니다.</li>
          <li><b>Pawn Logic:</b> 폰 행마일 때, <b>움직인 적 없는 기물</b>은 2칸 전진이 가능합니다. (충돌 체크 포함)</li>
          <li><b>Valid Move:</b> 이제 장애물을 뚫거나(나이트 제외) 기묘한 이동을 할 수 없습니다. 물리 엔진이 적용되었습니다.</li>
          <li><b>Winning:</b> 상대 <b>킹을 잡으면</b> 승리합니다. (복잡한 체크메이트 판정 대신 직관적 룰 채택)</li>
        </ul>
      </div>
    </div>
  );
}

const StatusCard = ({ player, active, logic }) => (
  <div style={{ 
    padding: '15px 25px', 
    borderRadius: '10px', 
    background: active ? '#fff' : '#e0e0e0',
    border: active ? `3px solid ${player === 'White' ? '#f1c40f' : '#34495e'}` : '1px solid #ccc',
    opacity: active ? 1 : 0.6,
    transition: 'all 0.3s'
  }}>
    <h3 style={{ margin: '0 0 5px 0' }}>{player} {active && '●'}</h3>
    <div>Logic: <b>{logic === 'STANDARD' ? 'Standard' : PIECES[logic]}</b></div>
  </div>
);