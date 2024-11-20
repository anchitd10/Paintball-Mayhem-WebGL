const canvas = document.getElementById("gameCanvas");
const gl = canvas.getContext("webgl");

let score = 0;
let gameOver = false;
let speedMultiplier = 1;
const difficultyIncreaseInterval = 5000;

if (!gl) {
    alert("WebGL not supported. Try a different browser.");
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Modified vertex shader to use matrices
const vertexShaderSource = `
    attribute vec2 position;
    attribute vec2 texCoord;
    varying vec2 v_texCoord;
    uniform mat3 u_matrix;
    uniform vec2 resolution;
    
    void main() {
        vec3 pos = u_matrix * vec3(position, 1.0);
        vec2 clipSpace = (pos.xy / resolution) * 2.0 - 1.0;
        clipSpace.y = -clipSpace.y;
        gl_Position = vec4(clipSpace, 0, 1);
        v_texCoord = texCoord;
    }
`;

const fragmentShaderSource = `
    precision mediump float;
    uniform sampler2D u_texture;
    varying vec2 v_texCoord;
    void main() {
        gl_FragColor = texture2D(u_texture, v_texCoord);
    }
`;

// Matrix operations
function makeTranslation(tx, ty) {
    return new Float32Array([
        1, 0, 0,
        0, 1, 0,
        tx, ty, 1

        // 1, 0, tx,
        // 0, 1, ty,
        // 0, 0, 1
    ]);
}

function makeScale(sx, sy) {
    return new Float32Array([
        sx, 0, 0,
        0, sy, 0,
        0, 0, 1
    ]);
}

function multiplyMatrices(a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2];
    const a10 = a[3], a11 = a[4], a12 = a[5];
    const a20 = a[6], a21 = a[7], a22 = a[8];
    const b00 = b[0], b01 = b[1], b02 = b[2];
    const b10 = b[3], b11 = b[4], b12 = b[5];
    const b20 = b[6], b21 = b[7], b22 = b[8];

    return new Float32Array([
        b00 * a00 + b01 * a10 + b02 * a20,
        b00 * a01 + b01 * a11 + b02 * a21,
        b00 * a02 + b01 * a12 + b02 * a22,
        b10 * a00 + b11 * a10 + b12 * a20,
        b10 * a01 + b11 * a11 + b12 * a21,
        b10 * a02 + b11 * a12 + b12 * a22,
        b20 * a00 + b21 * a10 + b22 * a20,
        b20 * a01 + b21 * a11 + b22 * a21,
        b20 * a02 + b21 * a12 + b22 * a22,
    ]);
}

// Compile shaders
function compileShader(gl, source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Error compiling shader:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

const vertexShader = compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
const fragmentShader = compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);

// Link program
const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Error linking program:', gl.getProgramInfoLog(program));
}

gl.useProgram(program);

// Get locations
const positionLocation = gl.getAttribLocation(program, "position");
const matrixLocation = gl.getUniformLocation(program, "u_matrix");
const resolutionLocation = gl.getUniformLocation(program, "resolution");
const textureLocation = gl.getUniformLocation(program, "u_texture");

// Create buffer
const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
const vertices = new Float32Array([
//    X,  Y            u, v
    -50, -50,          0, 0,
    50, -50,           1, 0,
    -50, 50,           0, 1,
    50, 50,            1, 1
    // (0, 0) corresponds to the bottom-left corner of the texture.
    // (1, 1) corresponds to the top-right corner of the texture.
]);
gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

// Bind attributes
const texCoordLocation = gl.getAttribLocation(program, "texCoord");
gl.enableVertexAttribArray(positionLocation);
gl.enableVertexAttribArray(texCoordLocation);
gl.vertexAttribPointer(
    positionLocation, 
    2, 
    gl.FLOAT, 
    false, 
    4 * 4, 
    0
);
gl.vertexAttribPointer(
    texCoordLocation, 
    2, 
    gl.FLOAT, 
    false, 
    4 * 4, 
    2 * 4);

// Load textures (same as before)
function loadTexture(gl, url) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, 
        new Uint8Array([0, 0, 255, 255]));

    const image = new Image();
    image.onload = function() {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    };
    image.src = url;
    return texture;
}

// Load all textures
const blockTexture = loadTexture(gl, 'Assets/crate.png');
const shooterTexture = loadTexture(gl, 'Assets/toy-gun-2.png');
const backgroundTexture = loadTexture(gl, 'Assets/bg-1.png');
const projectileTextures = [
    loadTexture(gl, 'Assets/paint-red.png'),
    loadTexture(gl, 'Assets/paint-green.png'),
    loadTexture(gl, 'Assets/paint-blue.png'),
    loadTexture(gl, 'Assets/paint-yellow.png'),
    loadTexture(gl, 'Assets/paint-orange.png'),
    loadTexture(gl, 'Assets/paint-pink.png')
];

// Load sounds
const shootSound = new Audio('Assets/shoot.mp3');
const blockDestroySound = new Audio('Assets/destroy.mp3');
const gameOverSound = new Audio('Assets/fail.mp3');

// Game objects with matrices
const shooter = {
    position: [canvas.width / 2, 50],
    width: 100,
    height: 100,
    texture: shooterTexture,
    matrix: makeTranslation(canvas.width / 2, 50)
};

let projectiles = [];
let blocks = [];
const keys = {};
let canShoot = true;

// Event listeners
window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
    if (e.key === ' ') {
        canShoot = true;
    }
});

function increaseDifficulty() {
    speedMultiplier += 0.1;
}

setInterval(increaseDifficulty, difficultyIncreaseInterval);

// Updated movement functions using matrices
function moveShooter() {
    if (keys['ArrowLeft'] && shooter.position[0] > shooter.width / 2) {
        shooter.position[0] -= 10;
        shooter.matrix = makeTranslation(shooter.position[0], shooter.position[1]);
    }
    if (keys['ArrowRight'] && shooter.position[0] < canvas.width - shooter.width / 2) {
        shooter.position[0] += 10;
        shooter.matrix = makeTranslation(shooter.position[0], shooter.position[1]);
    }
    if (keys[' '] && canShoot) {
        shootProjectile();
        canShoot = false;
    }
}

function shootProjectile() {
    const randomTexture = projectileTextures[Math.floor(Math.random() * projectileTextures.length)];
    projectiles.push({
        position: [...shooter.position],
        velocity: 10,
        texture: randomTexture,
        matrix: makeTranslation(shooter.position[0], shooter.position[1])
    });
    shootSound.play();
}

function spawnBlock() {
    const xPos = Math.random() * canvas.width;
    blocks.push({
        position: [xPos, canvas.height],
        velocity: 2,
        matrix: makeTranslation(xPos, canvas.height)
    });
}
setInterval(spawnBlock, 2000);

// Collision detection (same as before)
function detectCollision(block, projectile) {
    return (
        projectile.position[0] < block.position[0] + 50 &&
        projectile.position[0] > block.position[0] - 50 &&
        projectile.position[1] < block.position[1] + 50 &&
        projectile.position[1] > block.position[1] - 50
    );
}

function detectShooterCollision(block) {
    return (
        block.position[0] < shooter.position[0] + shooter.width / 2 &&
        block.position[0] > shooter.position[0] - shooter.width / 2 &&
        block.position[1] < shooter.position[1] + shooter.height / 2 &&
        block.position[1] > shooter.position[1] - shooter.height / 2
    );
}

// Updated update function using matrices
function update() {
    if (gameOver) return;
    
    moveShooter();

    projectiles = projectiles.filter(p => p.position[1] < canvas.height);
    projectiles.forEach(p => {
        p.position[1] += p.velocity;
        p.matrix = makeTranslation(p.position[0], p.position[1]);
    });

    blocks.forEach(block => {
        block.position[1] -= block.velocity * speedMultiplier;
        block.matrix = makeTranslation(block.position[0], block.position[1]);
    });

    blocks = blocks.filter(block => {
        if (detectShooterCollision(block)) {
            gameOver = true;
            gameOverSound.play();
            setTimeout(() => {
                alert(`Game Over! Final Score: ${score}`);
            }, 100);
            return false;
        }

        for (let i = 0; i < projectiles.length; i++) {
            if (detectCollision(block, projectiles[i])) {
                projectiles.splice(i, 1);
                score++;
                displayScore();
                blockDestroySound.play();
                return false;
            }
        }

        if (block.position[1] <= 0) {
            gameOver = true;
            gameOverSound.play();
            setTimeout(() => {
                alert(`Game Over! Final Score: ${score}`);
            }, 100);
            return false;
        }

        return true;
    });
}

// Updated render functions using matrices
function renderBackground() {
    gl.bindTexture(gl.TEXTURE_2D, backgroundTexture);
    
    const bgMatrix = multiplyMatrices(
        makeTranslation(canvas.width / 2, canvas.height / 2),
        makeScale(canvas.width, canvas.height)
    );
    
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniformMatrix3fv(matrixLocation, false, bgMatrix);

    const vertices = new Float32Array([
        -0.5, -0.5, 0, 0,
        0.5, -0.5, 1, 0,
        -0.5, 0.5, 0, 1,
        0.5, 0.5, 1, 1
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function renderObject(object) {
    const scaleMatrix = makeScale(object.width || 100, object.height || 100);
    const finalMatrix = multiplyMatrices(object.matrix, scaleMatrix);
    
    gl.uniformMatrix3fv(matrixLocation, false, finalMatrix);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function renderProjectiles() {
    projectiles.forEach(projectile => {
        gl.bindTexture(gl.TEXTURE_2D, projectile.texture);
        renderObject(projectile);
    });
}

// Score display
const scoreElement = document.createElement("div");
scoreElement.id = "score";
scoreElement.style.position = "absolute";
scoreElement.style.top = "10px";
scoreElement.style.right = "10px";
scoreElement.style.color = "black";
scoreElement.style.fontSize = "40px";
scoreElement.innerText = `Score: ${score}`;
document.body.appendChild(scoreElement);

function displayScore() {
    scoreElement.innerText = `Score: ${score}`;
}

displayScore();


// main render loop
function render() {
    if (gameOver) return;

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);

    renderBackground();

    update();

    // render shooter
    gl.bindTexture(gl.TEXTURE_2D, shooter.texture);
    renderObject(shooter);

    // render each projectile with its assigned random texture
    renderProjectiles();

    // render blocks
    blocks.forEach(block => {
        gl.bindTexture(gl.TEXTURE_2D, blockTexture);
        renderObject(block);
    });

    requestAnimationFrame(render);
}

requestAnimationFrame(render);
