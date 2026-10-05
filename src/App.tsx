import { useEffect, useMemo, useState } from 'react';

import './App.css';
import { buildDealingDotLayout, useGame } from './hooks/useGame';
import { fetchGames, fetchLeaderboard, fetchPlayers, saveGame } from './lib/gameService';
import {
  calcPoints,
  generateForcedBidSet,
  getTotals,
  getWinner,
  type Round,
} from './lib/scoring';
import type { LeaderboardRow, Player, SavedGameRecord } from './types';

const DEFAULT_PLAYERS = [
  'Keanu',
  'Isabelle',
  'Jane',
  'Paul',
  'Dan',
  'Suzie',
  'Sean',
];

// passcode removed — saves no longer require a group passcode
const normalizePlayerName = (name: string) => name.trim().toLowerCase();

type Screen = 'home' | 'setup' | 'game' | 'summary' | 'history' | 'games';

function App() {
  const { game, startGame, addRound, undoLastRound, resetGame } = useGame();
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>(DEFAULT_PLAYERS);
  const [highestRound, setHighestRound] = useState<number>(7);
  const [draftBids, setDraftBids] = useState<Record<string, number>>({});
  const [draftTricks, setDraftTricks] = useState<Record<string, number>>({});
  const [players, setPlayers] = useState<Player[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [games, setGames] = useState<SavedGameRecord[]>([]);
  // passcode state removed
  const [saveError, setSaveError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [draggedPlayer, setDraggedPlayer] = useState<string | null>(null);

  useEffect(() => {
    const loadPlayers = async () => {
      try {
        const fetchedPlayers = await fetchPlayers();
        setPlayers(fetchedPlayers);

        if (fetchedPlayers.length > 0) {
          setSelectedPlayers(fetchedPlayers.map((player) => player.name));
        }
      } catch (error) {
        console.warn('Unable to load players from Supabase; using local defaults.', error);
        setPlayers([]);
      }
    };

    const loadLeaderboard = async () => {
      try {
        const rows = await fetchLeaderboard();
        setLeaderboard(rows);
      } catch (error) {
        console.warn('Unable to load leaderboard.', error);
        setLeaderboard([]);
      }
    };

    const loadGames = async () => {
      try {
        const rows = await fetchGames();
        setGames(rows);
      } catch (error) {
        console.warn('Unable to load games.', error);
        setGames([]);
      }
    };

    void loadPlayers();
    void loadLeaderboard();
    void loadGames();
  }, []);

  // no passcode persistence

  const roundTemplates = useMemo(() => {
    if (!game) {
      return [];
    }

    return buildDealingDotLayout(game.playerIds.length, game.highestRound);
  }, [game]);

  const currentRoundIndex = game ? game.rounds.length : 0;
  const currentRoundTemplate =
    game && currentRoundIndex < roundTemplates.length ? roundTemplates[currentRoundIndex] : null;

  const totals = useMemo(() => {
    if (!game) {
      return {} as Record<string, number>;
    }

    return getTotals(game);
  }, [game]);

  const winner = useMemo(() => {
    if (!game || game.rounds.length === 0) {
      return null;
    }

    return getWinner(totals);
  }, [game, totals]);

  const playerIdByName = useMemo(() => {
    return Object.fromEntries(players.map((player) => [normalizePlayerName(player.name), player.id]));
  }, [players]);

  const playerNameById = useMemo(() => {
    return Object.fromEntries(players.map((player) => [player.id, player.name]));
  }, [players]);

  const orderedPlayerNames = useMemo(() => {
    return selectedPlayers.length > 0 ? selectedPlayers : DEFAULT_PLAYERS;
  }, [selectedPlayers]);

  useEffect(() => {
    if (!game) {
      setScreen((currentScreen) => (currentScreen === 'history' || currentScreen === 'games' || currentScreen === 'home' ? currentScreen : 'home'));
      return;
    }

    if (game.rounds.length >= roundTemplates.length) {
      setScreen('summary');
      return;
    }

    setScreen('game');
  }, [game, roundTemplates.length]);

  useEffect(() => {
    if (!game || !currentRoundTemplate) {
      return;
    }

    const startingBids: Record<string, number> = {};
    const startingTricks: Record<string, number> = {};

    for (const playerId of game.playerIds) {
      startingTricks[playerId] = 0;
      startingBids[playerId] = 0;
    }

    if (currentRoundTemplate.roundType === 'fbu' || currentRoundTemplate.roundType === 'fbo') {
      const forcedBids = generateForcedBidSet(
        game.playerIds,
        currentRoundTemplate.cardCount,
        currentRoundTemplate.roundType,
      );
      Object.assign(startingBids, forcedBids);
    }

    if (currentRoundTemplate.roundType === 'misery') {
      for (const playerId of game.playerIds) {
        startingBids[playerId] = 0;
      }
    }

    setDraftBids(startingBids);
    setDraftTricks(startingTricks);
  }, [currentRoundTemplate, game]);

  const togglePlayer = (playerName: string) => {
    setSelectedPlayers((current) =>
      current.includes(playerName)
        ? current.filter((name) => name !== playerName)
        : [...current, playerName],
    );
  };

  const movePlayer = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) {
      return;
    }

    setSelectedPlayers((current) => {
      const updated = [...current];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  };

  const handleBidChange = (playerId: string, value: number) => {
    const maxBid =
      currentRoundTemplate?.roundType === 'normal' || currentRoundTemplate?.roundType === 'nt'
        ? currentRoundTemplate.cardCount
        : 3;

    const nextValue = Number.isFinite(value) ? Math.trunc(value) : 0;

    setDraftBids((current) => ({
      ...current,
      [playerId]: Math.max(0, Math.min(maxBid, nextValue)),
    }));
  };

  const handleTrickChange = (playerId: string, value: number) => {
    const maxTricks = currentRoundTemplate?.cardCount ?? 0;
    const nextValue = Number.isFinite(value) ? Math.trunc(value) : 0;

    setDraftTricks((current) => ({
      ...current,
      [playerId]: Math.max(0, Math.min(maxTricks, nextValue)),
    }));
  };

  const isValidUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  const resolvePlayerId = (value: string): string => {
    if (isValidUuid(value)) {
      return value;
    }

    const match = players.find((player) => normalizePlayerName(player.name) === normalizePlayerName(value));
    return match?.id ?? value;
  };

  const handleStartGame = () => {
    if (selectedPlayers.length === 0) {
      setStartError('Select at least one player to start a game.');
      return;
    }

    const resolvedIds = orderedPlayerNames.flatMap((playerName) => {
      const mappedId = playerIdByName[normalizePlayerName(playerName)];
      if (mappedId) {
        return [mappedId];
      }

      return [playerName];
    });

    if (resolvedIds.length === 0) {
      setStartError('No valid players were selected.');
      return;
    }

    setStartError(null);
    startGame(resolvedIds, highestRound);
    setScreen('game');
  };

  const handleConfirmRound = () => {
    if (!game || !currentRoundTemplate) {
      return;
    }

    const round: Round = {
      cardCount: currentRoundTemplate.cardCount,
      roundType: currentRoundTemplate.roundType,
      bids: draftBids,
      tricks: draftTricks,
    };

    addRound(round);
  };

  const handleSaveGame = async () => {
    if (!game) {
      return;
    }
    const resolvedPlayerIds = game.playerIds.map(resolvePlayerId);

    const playerScores = game.playerIds.map((playerId, index) => ({
      player_id: resolvedPlayerIds[index],
      score: totals[playerId] ?? 0,
    }));
    setIsSaving(true);
    setSaveError(null);

    try {
      await saveGame(new Date().toISOString(), playerScores);
      resetGame();
      setScreen('home');
      const rows = await fetchLeaderboard();
      setLeaderboard(rows);
      const gameRows = await fetchGames();
      setGames(gameRows);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save the game.';
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const renderSetup = () => (
    <main className="app-shell setup-screen">
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <p className="eyebrow">Nomo scorer</p>
            <h1>New game</h1>
          </div>
          <button type="button" className="secondary-button" onClick={() => setScreen('home')}>
            Back
          </button>
        </div>

        <div className="field-block">
          <label htmlFor="highest-round">Highest round</label>
          <input
            id="highest-round"
            type="number"
            min={1}
            max={12}
            value={highestRound}
            onChange={(event) => setHighestRound(Math.max(1, Number(event.target.value) || 1))}
          />
        </div>

        <div className="field-block">
          <label>Players in this game (drag to reorder)</label>
          <div className="player-list">
            {orderedPlayerNames.map((playerName) => (
              <div
                key={playerName}
                draggable
                onDragStart={() => setDraggedPlayer(playerName)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (!draggedPlayer) {
                    return;
                  }

                  const fromIndex = orderedPlayerNames.indexOf(draggedPlayer);
                  const toIndex = orderedPlayerNames.indexOf(playerName);
                  if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
                    movePlayer(fromIndex, toIndex);
                  }
                }}
                className={`player-chip selected ${draggedPlayer === playerName ? 'dragging' : ''}`}
              >
                <button
                  type="button"
                  className="player-select-button"
                  onClick={() => togglePlayer(playerName)}
                >
                  {playerName}
                </button>
                <span className="player-order-index">{orderedPlayerNames.indexOf(playerName) + 1}</span>
              </div>
            ))}
          </div>
          
          {DEFAULT_PLAYERS.length > orderedPlayerNames.length && (
            <div className="unselected-players">
              <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '8px' }}>Click to add player:</p>
              <div className="player-list">
                {DEFAULT_PLAYERS.filter((name) => !orderedPlayerNames.includes(name)).map(
                  (playerName) => (
                    <button
                      key={playerName}
                      type="button"
                      className="player-chip add-button"
                      onClick={() => togglePlayer(playerName)}
                    >
                      + {playerName}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}
        </div>

        {startError ? <p className="save-error">{startError}</p> : null}

        <button type="button" className="primary-button" onClick={handleStartGame}>
          Start game
        </button>
      </div>
    </main>
  );

  const renderGame = () => {
    if (!game || !currentRoundTemplate) {
      return null;
    }

    return (
      <main className="app-shell round-entry-screen">
        <div className="panel round-panel">
          <div className="scoreboard-head">
            <div>
              <p className="eyebrow">Round {game.rounds.length + 1}</p>
              <h1>
                {currentRoundTemplate.cardCount}{' '}
                {currentRoundTemplate.roundType.toUpperCase()}
              </h1>
            </div>
            <div className="button-row">
              <button type="button" className="secondary-button" onClick={undoLastRound}>
                Undo last
              </button>
              <button type="button" className="secondary-button" onClick={() => setScreen('summary')}>
                Finish game
              </button>
            </div>
          </div>

          <div className="score-table">
            <div className="score-table-header" style={{ gridTemplateColumns: `120px repeat(${game.playerIds.length}, minmax(90px, 1fr))` }}>
              <div className="score-table-corner">Round</div>
              {game.playerIds.map((playerId) => (
                <div key={playerId} className="score-table-header-cell">
                  {playerNameById[playerId] ?? playerId}
                </div>
              ))}
            </div>

            {roundTemplates.map((row, index) => {
              const previousRound = game.rounds[index];
              const isCurrentRound = index === currentRoundIndex;
              const dealerIndex = row.dealerIndex;
              const labelText = row.roundType === 'normal' ? '' : row.roundType.toUpperCase();

              return (
                <div
                  key={`${row.cardCount}-${row.roundType}-${index}`}
                  className={isCurrentRound ? 'score-table-row active' : 'score-table-row'}
                  style={{ gridTemplateColumns: `120px repeat(${game.playerIds.length}, minmax(90px, 1fr))` }}
                >
                  <div className="score-table-label">
                    <span>{row.cardCount}</span>
                    {labelText ? <small>{labelText}</small> : null}
                  </div>

                  {game.playerIds.map((playerId, playerColumnIndex) => {
                    const bid = previousRound?.bids[playerId] ?? 0;
                    const tricks = previousRound?.tricks[playerId] ?? 0;
                    const points = previousRound ? calcPoints(bid, tricks, row.roundType) : 0;
                    const displayValue = previousRound ? `${bid}-${points}` : '-';
                    const isDealerCell = playerColumnIndex === dealerIndex;

                    return (
                      <div
                        key={`${playerId}-${index}`}
                        className={isDealerCell ? 'score-table-cell dealer-highlight' : 'score-table-cell'}
                      >
                        {previousRound ? <strong>{displayValue}</strong> : <span className="empty-cell">-</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="round-form">
            {game.playerIds.map((playerId) => (
              <div key={playerId} className="player-round-row">
                <div className="player-name">{playerNameById[playerId] ?? playerId}</div>
                <label>
                  Bid
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    max={
                      currentRoundTemplate.roundType === 'normal' || currentRoundTemplate.roundType === 'nt'
                        ? currentRoundTemplate.cardCount
                        : 3
                    }
                    value={draftBids[playerId] ?? 0}
                    onChange={(event) => handleBidChange(playerId, Number(event.target.value))}
                    disabled={
                      currentRoundTemplate.roundType === 'fbu' ||
                      currentRoundTemplate.roundType === 'fbo' ||
                      currentRoundTemplate.roundType === 'misery'
                    }
                  />
                </label>
                <label>
                  Tricks
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    max={currentRoundTemplate.cardCount}
                    value={draftTricks[playerId] ?? 0}
                    onChange={(event) => handleTrickChange(playerId, Number(event.target.value))}
                  />
                </label>
              </div>
            ))}
          </div>

          <button type="button" className="primary-button" onClick={handleConfirmRound}>
            Confirm round
          </button>
        </div>
      </main>
    );
  };

  const renderSummary = () => {
    if (!game) {
      return null;
    }

    return (
      <main className="app-shell scoreboard-screen">
        <div className="panel scoreboard-panel">
          <div className="scoreboard-head">
            <div>
              <p className="eyebrow">Game complete</p>
              <h1>Final score</h1>
            </div>
            <button type="button" className="secondary-button" onClick={() => resetGame()}>
              Discard
            </button>
          </div>

          <div className="summary-row">
            <span>Players: {game.playerIds.length}</span>
            <span>Highest round: {game.highestRound}</span>
            <span>Rounds: {game.rounds.length}</span>
          </div>

          <div className="score-grid">
            {game.playerIds.map((playerId) => (
              <div key={playerId} className="score-card">
                <h2>{playerNameById[playerId] ?? playerId}</h2>
                <strong>{totals[playerId] ?? 0}</strong>
              </div>
            ))}
          </div>

          {winner ? <p className="winner-banner">Winner: {playerNameById[winner] ?? winner}</p> : null}

          <div className="save-box">
            {saveError ? <p className="save-error">{saveError}</p> : null}
            <button type="button" className="primary-button" onClick={() => void handleSaveGame()} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save game'}
            </button>
          </div>
        </div>
      </main>
    );
  };

  const renderHome = () => (
    <main className="app-shell home-screen">
      <div className="panel">
        <p className="eyebrow">Nomo scorer</p>
        <h1>Home</h1>

        <div className="home-buttons">
          <button
            type="button"
            className="primary-button"
            onClick={() => setScreen('setup')}
          >
            + New game
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setScreen('history')}
          >
            View leaderboard
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setScreen('games')}
          >
            View game history
          </button>
        </div>
      </div>
    </main>
  );

  const renderGameHistory = () => {
    const gameCount = games.length;

    return (
      <main className="app-shell games-screen">
        <div className="panel">
          <div className="scoreboard-head">
            <div>
              <p className="eyebrow">Games</p>
              <h1>Game history</h1>
            </div>
            <button type="button" className="secondary-button" onClick={() => setScreen('home')}>
              Home
            </button>
          </div>

          <div className="games-list">
            {games.length === 0 ? (
              <p className="empty-state">No games saved yet.</p>
            ) : (
              games.map((savedGame, index) => {
                const gameDate = new Date(savedGame.played_at);
                const dateStr = gameDate.toLocaleDateString('en-GB');
                const timeStr = gameDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                const gameNumber = gameCount - index;
                const winner = savedGame.scores.length > 0
                  ? savedGame.scores.reduce((max, curr) => (curr.score > max.score ? curr : max))
                  : null;

                return (
                  <div key={savedGame.id} className="game-row">
                    <div className="game-info">
                      <div><strong>Game #{gameNumber}</strong></div>
                      <div className="game-date">{dateStr} at {timeStr}</div>
                      <div className="game-scores">
                        {savedGame.scores.map((score) => (
                          <span key={score.player_id}>
                            {score.name}: <strong>{score.score}</strong>
                          </span>
                        ))}
                      </div>
                      {winner ? <div className="game-winner">Winner: {winner.name}</div> : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    );
  };

  const renderHistory = () => (
    <main className="app-shell history-screen">
      <div className="panel">
        <div className="scoreboard-head">
          <div>
            <p className="eyebrow">League</p>
            <h1>Leaderboard</h1>
          </div>
          <button type="button" className="secondary-button" onClick={() => setScreen('home')}>
            Home
          </button>
        </div>

        <div className="leaderboard-list">
          {leaderboard.length === 0 ? (
            <p className="empty-state">No games saved yet.</p>
          ) : (
            leaderboard.map((row, index) => (
              <div key={`${row.name}-${index}`} className="leaderboard-row">
                <div className="leaderboard-player">
                  <span>{index + 1}. {row.name}</span>
                  <span className="game-count">{row.games} {row.games === 1 ? 'game' : 'games'}</span>
                </div>
                <strong>{row.avg_score.toFixed(2)}</strong>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );

  if (screen === 'home') {
    return renderHome();
  }

  if (screen === 'setup') {
    return renderSetup();
  }

  if (screen === 'game') {
    return renderGame();
  }

  if (screen === 'summary') {
    return renderSummary();
  }

  if (screen === 'games') {
    return renderGameHistory();
  }

  return renderHistory();
}

export default App;
