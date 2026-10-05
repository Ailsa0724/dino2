(() => {
  "use strict";

  const CONFIG = Object.freeze({
    width: 900,
    height: 400,
    groundHeight: 55,
    initialSpeed: 300,
    maxSpeed: 720,
    speedIncrease: 7,
    scorePerSecond: 10,
    coinScore: 100,
    initialObstacleDelay: 1.1,
    minimumObstacleDelay: 0.72,
    initialCoinDelay: 1.6,
    countdownStep: 0.72,
    player: {
      x: 100,
      width: 42,
      height: 52,
      gravity: 2100,
      jumpForce: -760,
      maxFallSpeed: 1250,
      fastFallMultiplier: 3,
    },
    maxParticles: 160,
    storageKeys: {
      highScore: "pixelRunnerHighScore",
      totalCoins: "pixelRunnerTotalCoins",
    },
  });

  const GameState = Object.freeze({
    MENU: "menu",
    COUNTDOWN: "countdown",
    PLAYING: "playing",
    PAUSED: "paused",
    GAME_OVER: "game_over",
  });

  const COUNTDOWN_LABELS = ["3", "2", "1", "GO!"];
  let storageWarning = "";
  const canvas = document.querySelector("#game-canvas");
  const playButton = document.querySelector("#play-button");
  const pauseButton = document.querySelector("#pause-button");
  const scoreElement = document.querySelector("#score");
  const highScoreElement = document.querySelector("#high-score");
  const coinsElement = document.querySelector("#coins");
  const liveStatus = document.querySelector("#live-status");

  if (
    !(canvas instanceof HTMLCanvasElement)
    || !playButton
    || !pauseButton
    || !scoreElement
    || !highScoreElement
    || !coinsElement
    || !liveStatus
  ) {
    throw new Error("Pixel Runner 初始化失敗：找不到必要的 HTML 元素。");
  }

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Pixel Runner 初始化失敗：瀏覽器無法建立 Canvas 2D context。");
  }

  function random(minimum, maximum) {
    return minimum + Math.random() * (maximum - minimum);
  }

  function randomInteger(minimum, maximum) {
    return Math.floor(random(minimum, maximum + 1));
  }

  function formatNumber(value) {
    return String(Math.max(0, Math.floor(value))).padStart(5, "0");
  }

  function readStoredNumber(key) {
    try {
      const value = Number.parseInt(localStorage.getItem(key) || "0", 10);
      return Number.isFinite(value) && value >= 0 ? value : 0;
    } catch (error) {
      storageWarning = "瀏覽器未允許本機儲存，分數與金幣無法持久保存。";
      return 0;
    }
  }

  function saveStoredNumber(key, value) {
    try {
      localStorage.setItem(key, String(Math.floor(value)));
      return true;
    } catch (error) {
      return false;
    }
  }

  function intersects(first, second) {
    const inset = 5;
    return first.x + inset < second.x + second.width - inset
      && first.x + first.width - inset > second.x + inset
      && first.y + inset < second.y + second.height - inset
      && first.y + first.height - inset > second.y + inset;
  }

  class Player {
    constructor() {
      this.width = CONFIG.player.width;
      this.height = CONFIG.player.height;
      this.x = CONFIG.player.x;
      this.velocityY = 0;
      this.gravity = CONFIG.player.gravity;
      this.jumpForce = CONFIG.player.jumpForce;
      this.isGrounded = true;
      this.isJumping = false;
      this.isDead = false;
      this.fastFalling = false;
      this.y = this.groundY - this.height;
      this.runTime = 0;
    }

    get groundY() {
      return CONFIG.height - CONFIG.groundHeight;
    }

    reset() {
      this.y = this.groundY - this.height;
      this.velocityY = 0;
      this.isGrounded = true;
      this.isJumping = false;
      this.isDead = false;
      this.fastFalling = false;
      this.runTime = 0;
    }

    jump() {
      if (!this.isGrounded || this.isDead) return false;
      this.velocityY = this.jumpForce;
      this.isGrounded = false;
      this.isJumping = true;
      this.fastFalling = false;
      return true;
    }

    setFastFall(enabled) {
      if (!this.isGrounded && !this.isDead) {
        this.fastFalling = enabled;
      }
    }

    update(deltaTime, speed) {
      this.runTime += deltaTime * speed / 100;
      if (this.isGrounded || this.isDead) return;

      const gravityScale = this.fastFalling ? CONFIG.player.fastFallMultiplier : 1;
      this.velocityY = Math.min(
        CONFIG.player.maxFallSpeed,
        this.velocityY + this.gravity * gravityScale * deltaTime,
      );
      this.y += this.velocityY * deltaTime;

      if (this.y + this.height >= this.groundY) {
        this.y = this.groundY - this.height;
        this.velocityY = 0;
        this.isGrounded = true;
        this.isJumping = false;
        this.fastFalling = false;
      }
    }

    getCollisionBox() {
      return {
        x: this.x + 7,
        y: this.y + 5,
        width: this.width - 14,
        height: this.height - 8,
      };
    }

    draw(ctx) {
      const x = Math.round(this.x);
      const bounce = this.isGrounded && !this.isDead
        ? Math.sin(this.runTime * 2.4) * 1.5
        : 0;
      const y = Math.round(this.y + bounce);
      const bodyColor = this.isDead ? "#ba4b54" : "#303843";
      const legSwing = this.isGrounded && !this.isDead
        ? Math.sin(this.runTime * 2.4) * 4
        : 0;

      ctx.fillStyle = "rgba(18, 28, 39, 0.2)";
      ctx.fillRect(x - 4, this.groundY + 3, this.width + 8, 5);

      ctx.fillStyle = bodyColor;
      ctx.fillRect(x + 8, y + 15, 28, 30);
      ctx.fillStyle = "#596879";
      ctx.fillRect(x + 13, y + 2, 27, 25);

      ctx.fillStyle = "#ffd43b";
      ctx.fillRect(x + 32, y + 8, 5, 5);

      ctx.fillStyle = bodyColor;
      ctx.fillRect(x + 10, y + 42, 8, Math.max(5, 10 + legSwing));
      ctx.fillRect(x + 27, y + 42, 8, Math.max(5, 10 - legSwing));
    }
  }

  class Obstacle {
    constructor(type, speed) {
      this.type = type;
      this.speedMultiplier = type === "tallTree" ? 0.94 : 1;
      this.x = CONFIG.width + 24;
      this.speed = speed;
      const dimensions = {
        smallRock: [30, 30],
        largeRock: [48, 45],
        spike: [35, 35],
        box: [40, 42],
        tree: [45, 70],
        tallTree: [55, 93],
      }[type] || [35, 35];
      [this.width, this.height] = dimensions;
      this.y = CONFIG.height - CONFIG.groundHeight - this.height;
    }

    update(deltaTime, speed) {
      this.speed = speed;
      this.x -= this.speed * this.speedMultiplier * deltaTime;
    }

    getCollisionBox() {
      const topInset = this.type === "spike" ? this.height * 0.35 : 4;
      return {
        x: this.x + 3,
        y: this.y + topInset,
        width: this.width - 6,
        height: this.height - topInset,
      };
    }

    draw(ctx) {
      switch (this.type) {
        case "smallRock":
        case "largeRock":
          ctx.fillStyle = "#63717e";
          ctx.beginPath();
          ctx.moveTo(this.x, this.y + this.height);
          ctx.lineTo(this.x + this.width * 0.25, this.y + 3);
          ctx.lineTo(this.x + this.width * 0.72, this.y + 7);
          ctx.lineTo(this.x + this.width, this.y + this.height);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#98a6b0";
          ctx.fillRect(this.x + this.width * 0.3, this.y + 12, 6, 4);
          break;
        case "spike":
          ctx.fillStyle = "#d94c55";
          ctx.beginPath();
          ctx.moveTo(this.x, this.y + this.height);
          ctx.lineTo(this.x + this.width / 2, this.y);
          ctx.lineTo(this.x + this.width, this.y + this.height);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#ff9090";
          ctx.fillRect(this.x + this.width / 2 - 2, this.y + 12, 4, 10);
          break;
        case "box":
          ctx.fillStyle = "#9b632e";
          ctx.fillRect(this.x, this.y, this.width, this.height);
          ctx.strokeStyle = "#68411f";
          ctx.lineWidth = 4;
          ctx.strokeRect(this.x + 2, this.y + 2, this.width - 4, this.height - 4);
          ctx.beginPath();
          ctx.moveTo(this.x + 4, this.y + 4);
          ctx.lineTo(this.x + this.width - 4, this.y + this.height - 4);
          ctx.moveTo(this.x + this.width - 4, this.y + 4);
          ctx.lineTo(this.x + 4, this.y + this.height - 4);
          ctx.stroke();
          break;
        case "tree":
        case "tallTree":
          ctx.fillStyle = "#75513c";
          ctx.fillRect(
            this.x + this.width * 0.37,
            this.y + this.height * 0.38,
            this.width * 0.26,
            this.height * 0.62,
          );
          ctx.fillStyle = this.type === "tallTree" ? "#23654c" : "#328250";
          ctx.fillRect(this.x + this.width * 0.08, this.y + this.height * 0.12, this.width * 0.84, this.height * 0.4);
          ctx.fillRect(this.x + this.width * 0.2, this.y, this.width * 0.6, this.height * 0.35);
          break;
        default:
          break;
      }
    }
  }

  class ObstacleManager {
    constructor() {
      this.items = [];
      this.timer = 0;
      this.nextSpawn = CONFIG.initialObstacleDelay;
    }

    reset() {
      this.items = [];
      this.timer = 0;
      this.nextSpawn = CONFIG.initialObstacleDelay;
    }

    update(deltaTime, elapsedTime, speed) {
      this.timer += deltaTime;
      if (this.timer >= this.nextSpawn) {
        this.spawn(elapsedTime, speed);
        this.timer = 0;
        const difficulty = Math.min(elapsedTime / 75, 1);
        const minimum = Math.max(CONFIG.minimumObstacleDelay, 1.05 - difficulty * 0.25);
        const maximum = Math.max(minimum + 0.3, 1.75 - difficulty * 0.35);
        this.nextSpawn = random(minimum, maximum);
      }

      for (const obstacle of this.items) obstacle.update(deltaTime, speed);
      this.items = this.items.filter((obstacle) => obstacle.x + obstacle.width > -8);
    }

    spawn(elapsedTime, speed) {
      const types = ["smallRock", "largeRock", "spike", "box", "tree"];
      if (elapsedTime > 22) types.push("tallTree");
      this.items.push(new Obstacle(types[randomInteger(0, types.length - 1)], speed));
    }

    draw(ctx) {
      for (const obstacle of this.items) obstacle.draw(ctx);
    }
  }

  class Coin {
    constructor(x, y, speed) {
      this.x = x;
      this.baseY = y;
      this.y = y;
      this.width = 22;
      this.height = 22;
      this.speed = speed;
      this.phase = random(0, Math.PI * 2);
      this.spin = random(0, Math.PI * 2);
      this.collected = false;
    }

    update(deltaTime, speed) {
      this.speed = speed;
      this.x -= this.speed * deltaTime;
      this.phase += deltaTime * 4;
      this.spin += deltaTime * 3;
      this.y = this.baseY + Math.sin(this.phase) * 4;
    }

    draw(ctx) {
      if (this.collected) return;
      const centerX = this.x + this.width / 2;
      const centerY = this.y + this.height / 2;
      const coinWidth = Math.max(6, Math.abs(Math.cos(this.spin)) * 11);

      ctx.fillStyle = "rgba(255, 212, 59, 0.2)";
      ctx.beginPath();
      ctx.arc(centerX, centerY, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f5a900";
      ctx.fillRect(centerX - coinWidth / 2, centerY - 10, coinWidth, 20);
      ctx.fillStyle = "#ffdc51";
      ctx.fillRect(centerX - coinWidth / 2 + 2, centerY - 8, Math.max(2, coinWidth * 0.55), 15);
      ctx.fillStyle = "#fff3bf";
      ctx.fillRect(centerX - 2, centerY - 5, 3, 4);
    }
  }

  class CoinManager {
    constructor() {
      this.items = [];
      this.timer = 0;
      this.nextSpawn = CONFIG.initialCoinDelay;
    }

    reset() {
      this.items = [];
      this.timer = 0;
      this.nextSpawn = CONFIG.initialCoinDelay;
    }

    update(deltaTime, speed) {
      this.timer += deltaTime;
      if (this.timer >= this.nextSpawn) {
        this.spawnPattern(speed);
        this.timer = 0;
        this.nextSpawn = random(2.3, 3.8);
      }

      for (const coin of this.items) coin.update(deltaTime, speed);
      this.items = this.items.filter((coin) => !coin.collected && coin.x + coin.width > -10);
    }

    spawnPattern(speed) {
      const startX = CONFIG.width + 30;
      const baseY = CONFIG.height - CONFIG.groundHeight - 88;
      const pattern = randomInteger(0, 2);

      for (let index = 0; index < 6; index += 1) {
        let y = baseY;
        if (pattern === 1) {
          y -= Math.sin((Math.PI * index) / 5) * 62;
        } else if (pattern === 2 && index % 2 === 1) {
          y -= 52;
        }
        this.items.push(new Coin(startX + index * 42, y, speed));
      }
    }

    draw(ctx) {
      for (const coin of this.items) coin.draw(ctx);
    }
  }

  class Particle {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      this.velocityX = random(-125, 125);
      this.velocityY = random(-250, -50);
      this.life = random(0.3, 0.75);
      this.maxLife = this.life;
      this.size = random(2, 5);
      this.color = color;
      this.gravity = 560;
    }

    update(deltaTime) {
      this.x += this.velocityX * deltaTime;
      this.y += this.velocityY * deltaTime;
      this.velocityY += this.gravity * deltaTime;
      this.life -= deltaTime;
    }

    draw(ctx) {
      ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
      ctx.fillStyle = this.color;
      ctx.fillRect(this.x, this.y, this.size, this.size);
      ctx.globalAlpha = 1;
    }
  }

  class ParticleSystem {
    constructor() {
      this.items = [];
    }

    emit(x, y, color, amount) {
      for (let index = 0; index < amount && this.items.length < CONFIG.maxParticles; index += 1) {
        this.items.push(new Particle(x, y, color));
      }
    }

    update(deltaTime) {
      for (const particle of this.items) particle.update(deltaTime);
      this.items = this.items.filter((particle) => particle.life > 0);
    }

    draw(ctx) {
      for (const particle of this.items) particle.draw(ctx);
      ctx.globalAlpha = 1;
    }

    reset() {
      this.items = [];
    }
  }

  class Game {
    constructor(ctx) {
      this.context = ctx;
      this.player = new Player();
      this.obstacles = new ObstacleManager();
      this.coins = new CoinManager();
      this.particles = new ParticleSystem();
      this.state = GameState.MENU;
      this.score = 0;
      this.warning = "";
      this.highScore = readStoredNumber(CONFIG.storageKeys.highScore);
      this.totalCoins = readStoredNumber(CONFIG.storageKeys.totalCoins);
      this.runCoins = 0;
      this.elapsedTime = 0;
      this.speed = CONFIG.initialSpeed;
      this.groundOffset = 0;
      this.cloudOffset = 0;
      this.countdownIndex = 0;
      this.countdownTimer = 0;
      this.lastTime = 0;
      this.warning = storageWarning;
      this.clouds = [
        { x: 105, y: 77, size: 1 },
        { x: 405, y: 124, size: 0.75 },
        { x: 720, y: 66, size: 0.9 },
      ];
      this.displayedScore = -1;
      this.displayedHighScore = -1;
      this.displayedCoins = -1;
      this.loop = this.loop.bind(this);
      this.frameRequest = requestAnimationFrame(this.loop);
      this.updateHud();
      this.syncControls();
      this.draw();
    }

    start() {
      this.player.reset();
      this.obstacles.reset();
      this.coins.reset();
      this.particles.reset();
      this.score = 0;
      this.runCoins = 0;
      this.elapsedTime = 0;
      this.speed = CONFIG.initialSpeed;
      this.groundOffset = 0;
      this.countdownIndex = 0;
      this.countdownTimer = 0;
      this.state = GameState.COUNTDOWN;
      this.lastTime = performance.now();
      this.warning = "";
      this.updateHud();
      this.syncControls();
    }

    togglePause() {
      if (this.state === GameState.PLAYING) {
        this.state = GameState.PAUSED;
      } else if (this.state === GameState.PAUSED) {
        this.state = GameState.PLAYING;
        this.lastTime = performance.now();
      } else {
        return;
      }
      this.syncControls();
    }

    handleCanvasAction() {
      if (this.state === GameState.MENU || this.state === GameState.GAME_OVER) {
        this.start();
      } else if (this.state === GameState.PLAYING) {
        this.player.jump();
      } else if (this.state === GameState.PAUSED) {
        this.togglePause();
      }
    }

    loop(timestamp) {
      const deltaTime = this.lastTime
        ? Math.min(Math.max((timestamp - this.lastTime) / 1000, 0), 0.05)
        : 0;
      this.lastTime = timestamp;

      if (this.state === GameState.COUNTDOWN) {
        this.updateCountdown(deltaTime);
      } else if (this.state === GameState.PLAYING) {
        this.update(deltaTime);
      } else if (this.state === GameState.GAME_OVER) {
        this.particles.update(deltaTime);
      }

      this.draw();
      this.frameRequest = requestAnimationFrame(this.loop);
    }

    updateCountdown(deltaTime) {
      this.countdownTimer += deltaTime;
      if (this.countdownTimer < CONFIG.countdownStep) return;

      this.countdownTimer -= CONFIG.countdownStep;
      this.countdownIndex += 1;
      if (this.countdownIndex >= COUNTDOWN_LABELS.length) {
        this.state = GameState.PLAYING;
        this.lastTime = performance.now();
        this.syncControls();
      }
    }

    update(deltaTime) {
      this.elapsedTime += deltaTime;
      this.speed = Math.min(
        CONFIG.maxSpeed,
        CONFIG.initialSpeed + this.elapsedTime * CONFIG.speedIncrease,
      );
      this.score += deltaTime * CONFIG.scorePerSecond;
      this.player.update(deltaTime, this.speed);
      this.obstacles.update(deltaTime, this.elapsedTime, this.speed);
      this.coins.update(deltaTime, this.speed);
      this.particles.update(deltaTime);
      this.groundOffset = (this.groundOffset + this.speed * deltaTime) % 40;
      this.cloudOffset = (this.cloudOffset + this.speed * 0.08 * deltaTime) % CONFIG.width;
      this.checkCollisions();
      this.updateHud();
    }

    checkCollisions() {
      const playerBox = this.player.getCollisionBox();
      for (const obstacle of this.obstacles.items) {
        if (intersects(playerBox, obstacle.getCollisionBox())) {
          this.finish();
          return;
        }
      }

      for (const coin of this.coins.items) {
        if (!coin.collected && intersects(playerBox, coin)) {
          coin.collected = true;
          this.runCoins += 1;
          this.totalCoins += 1;
          this.score += CONFIG.coinScore;
          this.particles.emit(coin.x + coin.width / 2, coin.y + coin.height / 2, "#ffd43b", 10);
          if (!saveStoredNumber(CONFIG.storageKeys.totalCoins, this.totalCoins)) {
            this.warning = "本機儲存不可用，收集金幣總數不會保留。";
          }
        }
      }
    }

    finish() {
      if (this.state !== GameState.PLAYING) return;
      this.state = GameState.GAME_OVER;
      this.player.isDead = true;
      this.player.velocityY = 0;
      this.particles.emit(
        this.player.x + this.player.width / 2,
        this.player.y + this.player.height / 2,
        "#ff7474",
        28,
      );

      const finalScore = Math.floor(this.score);
      if (finalScore > this.highScore) {
        this.highScore = finalScore;
        if (!saveStoredNumber(CONFIG.storageKeys.highScore, this.highScore)) {
          this.warning = "本機儲存不可用，最高分無法保留。";
        }
      }
      this.updateHud();
      this.syncControls();
    }

    updateHud() {
      const score = Math.floor(this.score);
      if (score !== this.displayedScore) {
        scoreElement.textContent = formatNumber(score);
        this.displayedScore = score;
      }
      if (this.highScore !== this.displayedHighScore) {
        highScoreElement.textContent = formatNumber(this.highScore);
        this.displayedHighScore = this.highScore;
      }
      if (this.totalCoins !== this.displayedCoins) {
        coinsElement.textContent = formatNumber(this.totalCoins);
        this.displayedCoins = this.totalCoins;
      }
    }

    syncControls() {
      pauseButton.disabled = ![GameState.PLAYING, GameState.PAUSED].includes(this.state);
      pauseButton.textContent = this.state === GameState.PAUSED ? "RESUME" : "PAUSE";
      playButton.disabled = this.state === GameState.COUNTDOWN
        || this.state === GameState.PLAYING
        || this.state === GameState.PAUSED;
      playButton.textContent = this.state === GameState.GAME_OVER ? "RETRY" : "PLAY";

      const messages = {
        [GameState.MENU]: "Pixel Runner 已就緒，按 PLAY 開始。",
        [GameState.COUNTDOWN]: "遊戲即將開始。",
        [GameState.PLAYING]: "遊戲進行中。",
        [GameState.PAUSED]: "遊戲已暫停。",
        [GameState.GAME_OVER]: `遊戲結束。本局收集 ${this.runCoins} 枚金幣。按 Enter 或 Retry 再試一次。`,
      };
      liveStatus.textContent = [messages[this.state], this.warning].filter(Boolean).join(" ");
    }

    draw() {
      const ctx = this.context;
      ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);
      this.drawBackground(ctx);
      this.drawGround(ctx);
      this.coins.draw(ctx);
      this.obstacles.draw(ctx);
      this.player.draw(ctx);
      this.particles.draw(ctx);

      if (this.state === GameState.MENU) {
        this.drawOverlay(ctx, "PIXEL RUNNER", "按 PLAY 或點擊畫面開始", "跳過障礙，收集金幣！");
      } else if (this.state === GameState.COUNTDOWN) {
        this.drawCountdown(ctx);
      } else if (this.state === GameState.PAUSED) {
        this.drawOverlay(ctx, "PAUSED", "按 P 或按 RESUME 繼續", "");
      } else if (this.state === GameState.GAME_OVER) {
        this.drawOverlay(
          ctx,
          "GAME OVER",
          `SCORE: ${formatNumber(this.score)}   HI: ${formatNumber(this.highScore)}`,
          `COINS: ${formatNumber(this.runCoins)}   按 ENTER 或點擊重試`,
        );
      }
    }

    drawBackground(ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 0, CONFIG.height);
      gradient.addColorStop(0, "#87ceeb");
      gradient.addColorStop(1, "#dff6ff");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);

      ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
      for (const cloud of this.clouds) {
        let x = cloud.x - this.cloudOffset * 0.28;
        if (x < -100) x += CONFIG.width + 200;
        const unit = 11 * cloud.size;
        ctx.fillRect(x, cloud.y, unit * 4, unit);
        ctx.fillRect(x + unit, cloud.y - unit, unit * 2, unit);
        ctx.fillRect(x + unit * 2.5, cloud.y - unit * 0.55, unit * 1.7, unit * 0.55);
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.beginPath();
      ctx.arc(748, 90, 33, 0, Math.PI * 2);
      ctx.fill();
    }

    drawGround(ctx) {
      const groundY = CONFIG.height - CONFIG.groundHeight;
      ctx.fillStyle = "#4a5568";
      ctx.fillRect(0, groundY, CONFIG.width, CONFIG.groundHeight);
      ctx.fillStyle = "#2d3748";
      ctx.fillRect(0, groundY, CONFIG.width, 5);
      ctx.fillStyle = "#8795a4";
      for (let x = -40 + this.groundOffset; x < CONFIG.width; x += 40) {
        ctx.fillRect(Math.round(x), groundY + 20, 20, 4);
        ctx.fillRect(Math.round(x + 24), groundY + 39, 8, 3);
      }
    }

    drawCountdown(ctx) {
      const label = COUNTDOWN_LABELS[Math.min(this.countdownIndex, COUNTDOWN_LABELS.length - 1)];
      this.drawOverlay(ctx, label, "", "");
    }

    drawOverlay(ctx, title, message, detail) {
      ctx.fillStyle = "rgba(10, 18, 28, 0.67)";
      ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffd43b";
      ctx.font = "900 56px Arial, sans-serif";
      ctx.fillText(title, CONFIG.width / 2, message || detail ? 153 : CONFIG.height / 2);

      if (message) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "700 20px Arial, sans-serif";
        ctx.fillText(message, CONFIG.width / 2, 211);
      }
      if (detail) {
        ctx.fillStyle = "#d5e0e8";
        ctx.font = "600 15px Arial, sans-serif";
        ctx.fillText(detail, CONFIG.width / 2, 250);
      }
    }
  }

  const game = new Game(context);

  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" || event.code === "ArrowUp") {
      event.preventDefault();
      if (game.state === GameState.PLAYING) {
        game.player.jump();
      } else if (game.state === GameState.MENU || game.state === GameState.GAME_OVER) {
        game.start();
      }
    } else if (event.code === "ArrowDown") {
      event.preventDefault();
      game.player.setFastFall(true);
    } else if (event.code === "Enter") {
      if (game.state === GameState.GAME_OVER || game.state === GameState.MENU) {
        game.start();
      }
    } else if (event.key.toLowerCase() === "p") {
      game.togglePause();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "ArrowDown") game.player.setFastFall(false);
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    game.handleCanvasAction();
  });

  playButton.addEventListener("click", () => {
    if (game.state === GameState.MENU || game.state === GameState.GAME_OVER) {
      game.start();
    }
  });

  pauseButton.addEventListener("click", () => {
    game.togglePause();
  });
})();
