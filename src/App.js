import React, { useState, useEffect, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';

// --- 커스텀 로직을 위한 유틸리티 및 상태 정의 ---

const INITIAL_GAME_STATE = {
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moveLogic: 'STANDARD', // 'STANDARD', 'MIMIC_<PIECE_TYPE>'
  lastMovedPieceType: null, // 'p', 'n', 'b', 'r', 'q', 'k'
  history: [], // { turn: 'w' | 'b', piece: 'p' | 'n' | ... }
  pieceHasMoved: { // 폰 2칸 전진 및 앙파상 로직을 위해 필수
    w: { p: new Array(8).fill(false), r: [false, false], k: false },
    b: { p: new Array(8).fill(false), r: [false, false], k: false }
  }
};

function getPieceName(pieceChar) {
  const pieceMap = {
    p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King'
  };
  return pieceMap[pieceChar.toLowerCase()] || 'Unknown';
}

function getDisplayMoveLogic(moveLogic, turn, history) {
  if (moveLogic === 'STANDARD') {
    return `${turn === 'w' ? 'White' : 'Black'} - Standard Move`;
  }
  if (moveLogic.startsWith('MIMIC_')) {
    const pieceType = moveLogic.split('_')[1];
    const pieceName = getPieceName(pieceType);
    return `${turn === 'w' ? 'White' : 'Black'} - MIMIC: Only ${pieceName} moves allowed.`;
  }
  return `${turn === 'w' ? 'White' : 'Black'} - Unknown Logic`;
}

function App() {
  const [game, setGame] = useState(new Chess(INITIAL_GAME_STATE.fen));
  const [gameState, setGameState] = useState({
    moveLogic: INITIAL_GAME_STATE.moveLogic,
    lastMovedPieceType: INITIAL_GAME_STATE.lastMovedPieceType,
    history: INITIAL_GAME_STATE.history,
    pieceHasMoved: INITIAL_GAME_STATE.pieceHasMoved,
  });
  const [warning, setWarning] = useState(null);
  const turn = game.turn();
  const isGameOver = game.isGameOver();
  const displayLogic = getDisplayMoveLogic(gameState.moveLogic, turn, gameState.history);

  // --- 상태 업데이트 및 턴 종료 로직 ---

  const safeGameMutate = useCallback((modify) => {
    setGame((g) => {
      const newGame = new Chess(g.fen());
      modify(newGame);
      return newGame;
    });
  }, []);

  const handleTurnEnd = useCallback((newGame) => {
    const lastMoveVerbose = newGame.history({ verbose: true }).pop();
    
    let pieceMovedChar = null;
    if (lastMoveVerbose) {
        pieceMovedChar = lastMoveVerbose.piece;
    }

    let nextMoveLogic = 'STANDARD';
    const totalMoves = newGame.history().length;
    
    if (pieceMovedChar && totalMoves >= 3) {
        nextMoveLogic = `MIMIC_${pieceMovedChar.toUpperCase()}`;
    }
    
    // 상태 업데이트
    setGameState(prev => ({
        moveLogic: nextMoveLogic,
        lastMovedPieceType: pieceMovedChar ? pieceMovedChar.toUpperCase() : null,
        history: [...prev.history, { turn: turn, piece: pieceMovedChar, from: lastMoveVerbose ? lastMoveVerbose.from : null, to: lastMoveVerbose ? lastMoveVerbose.to : null }],
        pieceHasMoved: prev.pieceHasMoved
    }));

  }, [turn]); 

  // --- 이동 유효성 검사 (핵심 로직) ---

  const isMoveAllowed = useCallback((sourceSquare, targetSquare) => {
    const currentTurn = game.turn();
    const currentLogic = gameState.moveLogic;
    
    if (isGameOver) {
        setWarning("게임이 종료되었습니다.");
        return false;
    }

    let moves = game.moves({
      square: sourceSquare,
      verbose: true
    });

    const moveDetails = moves.find(move => move.to === targetSquare);

    if (!moveDetails) {
      setWarning("해당 칸으로 이동할 수 없습니다.");
      return false;
    }
    
    // 2. 미믹 규칙 적용 (2턴 이후)
    if (currentLogic.startsWith('MIMIC_')) {
      const requiredPiece = currentLogic.split('_')[1]; 
      
      const movingPiece = game.get(sourceSquare);
      if (!movingPiece || movingPiece.type.toUpperCase() !== requiredPiece) {
        setWarning(`현재 ${getPieceName(requiredPiece)}의 행마법만 허용됩니다.`);
        return false;
      }
    }
    
    // 3. 특수 규칙 적용
    
    // 3-3. 캐슬링 (규칙 3): 삭제
    if (moveDetails.flags.includes('k') || moveDetails.flags.includes('q')) {
      setWarning("캐슬링은 본 게임에서 삭제되었습니다.");
      return false;
    }
    
    // 3-1. 폰 전이 (규칙 1) - 폰의 2칸 전진
    if (moveDetails.piece.toLowerCase() === 'p' && moveDetails.color === currentTurn) {
        const fromRow = sourceSquare.charCodeAt(1);
        const toRow = targetSquare.charCodeAt(1);
        const twoStepMove = Math.abs(fromRow - toRow) === 2;

        if (twoStepMove) {
            const pieceIndex = sourceSquare.charCodeAt(0) - 'a'.charCodeAt(0);
            const pieceMovedBefore = gameState.pieceHasMoved[currentTurn].p[pieceIndex];
            
            if (pieceMovedBefore) {
                setWarning("폰은 이미 움직였으므로 2칸 전진할 수 없습니다.");
                return false;
            }
        }
    }

    // 3-2. 앙파상 (규칙 2)
    if (moveDetails.flags.includes('e')) { 
        const prevMove = gameState.history[gameState.history.length - 1];
        
        if (!prevMove || prevMove.piece.toLowerCase() !== 'p') {
             setWarning("규칙 위반: 앙파상 조건(상대 폰의 2칸 전진)이 충족되지 않았습니다.");
             return false;
        }
    }
    
    return true;
  }, [game, gameState.moveLogic, gameState.history, gameState.pieceHasMoved, isGameOver]);


  // --- 보드 핸들러 ---

  function onDrop(sourceSquare, targetSquare, piece) {
    setWarning(null);
    if (!isMoveAllowed(sourceSquare, targetSquare)) {
      return false; 
    }

    let promotionType = undefined;

    const potentialMoves = game.moves({ square: sourceSquare, verbose: true });
    const standardMove = potentialMoves.find(m => m.to === targetSquare);
    
    if (standardMove && standardMove.flags.includes('p')) {
        promotionType = 'q'; // 규칙 4: 임시로 퀸으로 프로모션
    }
    
    let move = null;
    safeGameMutate((game) => {
      move = game.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: promotionType
      });
    });

    if (move === null) {
      setWarning("알 수 없는 이유로 이동에 실패했습니다. 다시 시도하거나 새 게임을 시작하세요.");
      return false; 
    }
    
    handleTurnEnd(game);
    
    return true;
  }

  // 게임 시작 시 초기 상태 설정 및 폰 이동 기록 동기화
  useEffect(() => {
    const historyVerbose = game.history({ verbose: true });
    const currentTurn = game.turn() === 'w' ? 'b' : 'w'; // 직전 턴
    
    if (historyVerbose.length === 0) {
        const initialPieceHasMoved = {
            w: { p: new Array(8).fill(false), r: [false, false], k: false },
            b: { p: new Array(8).fill(false), r: [false, false], k: false }
        };
        setGameState(prev => ({
            ...prev,
            pieceHasMoved: initialPieceHasMoved,
            moveLogic: 'STANDARD',
            lastMovedPieceType: null
        }));
    } else {
        const lastMove = historyVerbose[historyVerbose.length - 1];
        
        if (lastMove.piece.toLowerCase() === 'p' && lastMove.color === currentTurn) {
            const fileIndex = lastMove.from.charCodeAt(0) - 'a'.charCodeAt(0);
            if (fileIndex >= 0 && fileIndex < 8) {
                setGameState(prev => {
                    const newPieceHasMoved = { ...prev.pieceHasMoved };
                    newPieceHasMoved[currentTurn].p[fileIndex] = true;
                    return { ...prev, pieceHasMoved: newPieceHasMoved };
                });
            }
        }

        if (lastMove.flags.includes('p')) {
             setGameState(prev => ({
                ...prev,
                moveLogic: `MIMIC_P` 
            }));
        }
    }
  }, [game.fen()]); 

  useEffect(() => {
      if (!isGameOver) {
          setWarning(null);
      }
  }, [turn, isGameOver]);

  // --- UI 렌더링 ---

  const resetGame = () => {
    setGame(new Chess(INITIAL_GAME_STATE.fen));
    setGameState({
        moveLogic: INITIAL_GAME_STATE.moveLogic,
        lastMovedPieceType: INITIAL_GAME_STATE.lastMovedPieceType,
        history: [],
        pieceHasMoved: { 
            w: { p: new Array(8).fill(false), r: [false, false], k: false },
            b: { p: new Array(8).fill(false), r: [false, false], k: false }
        }
    });
    setWarning(null);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ textAlign: 'center' }}>Mimic Chess (따라쟁이 체스)</h1>
      
      <div style={{ textAlign: 'center', marginBottom: '20px', border: '1px solid #ccc', padding: '10px', borderRadius: '5px' }}>
        <p style={{ fontSize: '1.2em', fontWeight: 'bold', color: turn === 'w' ? '#000' : '#555' }}>
          {displayLogic}
        </p>
        {warning && (
          <p style={{ color: 'red', fontWeight: 'bold' }}>경고: {warning}</p>
        )}
        {isGameOver && (
            <p style={{ color: 'blue', fontSize: '1.2em' }}>게임 종료! {game.isCheckmate() ? '체크메이트' : game.isDraw() ? '무승부' : '게임 종료'}</p>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '500px' }}>
          <Chessboard 
            position={game.fen()} 
            onPieceDrop={onDrop}
            boardOrientation={turn === 'w' ? "white" : "black"} // 턴에 따라 보드 방향 변경 (플레이어 시점)
          />
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <button onClick={resetGame} style={{ padding: '10px 20px', fontSize: '1em' }}>
          새 게임 시작
        </button>
        <p style={{marginTop: '15px', fontSize: '0.8em', color: '#666'}}>
            참고: 캐슬링은 규칙에 따라 삭제되었으며, 폰 프로모션 후 다음 턴은 무조건 폰 행마 권한을 가집니다.
        </p>
      </div>
    </div>
  );
}

export default App;