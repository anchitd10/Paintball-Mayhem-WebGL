const canvas = document.getElementById("gameCanvas");
const gl = canvas.getContext("webgl");

let score = 0;  // Keep track of the score
let gameOver = false;  // Game over flag

let speedMultiplier = 1;  // Start multiplier at 1
const difficultyIncreaseInterval = 5000;

if (!gl) {
    alert("WebGL not supported. Try a different browser.");
}

// Set canvas size to full window
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();  // Initial call to set canvas size

// Vertex shader
const vertexShaderSource = `
    attribute vec2 position;
    attribute vec2 texCoord; // Add texture coordinate attribute
    varying vec2 v_texCoord;
    uniform vec2 translation;
    uniform vec2 resolution;
    
    void main() {
        vec2 newPosition = ((position + translation) / resolution) * 2.0 - 1.0;  // Map to clip space
        newPosition.y = -newPosition.y;  // Flip y-axis to match WebGL's bottom-left origin
        gl_Position = vec4(newPosition, 0, 1);
        v_texCoord = texCoord; // Pass the texture coordinates to fragment shader
    }
`;

// Fragment shader
const fragmentShaderSource = `
    precision mediump float;
    uniform sampler2D u_texture;
    varying vec2 v_texCoord;
    void main() {
        gl_FragColor = texture2D(u_texture, v_texCoord);
    }
`;

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

// Get attribute/uniform locations
const positionLocation = gl.getAttribLocation(program, "position");
const translationLocation = gl.getUniformLocation(program, "translation");
const resolutionLocation = gl.getUniformLocation(program, "resolution");
const textureLocation = gl.getUniformLocation(program, "u_texture");

// Create buffer
const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
const vertices = new Float32Array([
    // Position coordinates     // Texture coordinates
    -50, -50,                 0, 0,   // Bottom left
    50, -50,                  1, 0,   // Bottom right
    -50, 50,                  0, 1,   // Top left
    50, 50,                   1, 1    // Top right
]);
gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

// Bind position attribute
const texCoordLocation = gl.getAttribLocation(program, "texCoord");

gl.enableVertexAttribArray(positionLocation);
gl.enableVertexAttribArray(texCoordLocation);

// Point to the position attribute
gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 4 * 4, 0);
// Point to the texCoord attribute
gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 4 * 4, 2 * 4);

// Texture loading
function loadTexture(gl, url) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]));

    const image = new Image();
    image.onload = function () {
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

// ----------Textures----------
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

// ----------SFX---------------
const shootSound = new Audio('Assets/shoot.mp3');
const blockDestroySound = new Audio('Assets/destroy.mp3');
const gameOverSound = new Audio('Assets/fail.mp3');


// Shooter object
const shooter = {
    position: [canvas.width / 2, 50],
    width: 100,
    height: 100,
    texture: shooterTexture
};

let projectiles = [];

let blocks = [];

const keys = {};
let canShoot = true;

window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
    if (e.key === ' ') {
        canShoot = true;  // reset shoot flag on spacebar release
    }
});

function increaseDifficulty() {
    speedMultiplier += 0.1;
}

setInterval(increaseDifficulty, difficultyIncreaseInterval);

// shooter movement
function moveShooter() {
    if (keys['ArrowLeft'] && shooter.position[0] > shooter.width / 2) {
        shooter.position[0] -= 10;
    }
    if (keys['ArrowRight'] && shooter.position[0] < canvas.width - shooter.width / 2) {
        shooter.position[0] += 10;
    }
    if (keys[' '] && canShoot) {
        shootProjectile();
        canShoot = false;  // Disable shooting until the spacebar is released
    }
}

// shoot projectiles
function shootProjectile() {
    const randomTexture = projectileTextures[Math.floor(Math.random() * projectileTextures.length)];
    projectiles.push({
        position: [...shooter.position],
        velocity: 10,
        texture: randomTexture
    });
    shootSound.play();
}

// Spawning blocks
function spawnBlock() {
    blocks.push({
        position: [Math.random() * canvas.width, canvas.height],
        velocity: 2
    });
}
setInterval(spawnBlock, 2000);

// collision detection
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

function update() {
    if (gameOver) return;
    
    moveShooter();

    // move projectiles
    projectiles = projectiles.filter(p => p.position[1] < canvas.height);
    projectiles.forEach(p => {
        p.position[1] += p.velocity;
    });

    // dynamic difficulty
    blocks.forEach(block => {
        block.position[1] -= block.velocity * speedMultiplier;  // Apply speed multiplier
    });

    // check for collision and update score
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

// render background
function renderBackground() {
    gl.bindTexture(gl.TEXTURE_2D, backgroundTexture);
    gl.uniform2fv(translationLocation, [canvas.width / 2, canvas.height / 2]);

    const width = canvas.width;
    const height = canvas.height;
    const vertices = new Float32Array([
        -width / 2, -height / 2, 0, 0,
        width / 2, -height / 2, 1, 0,
        -width / 2, height / 2, 0, 1,
        width / 2, height / 2, 1, 1
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}


// Render objects
function renderObject(object) {
    gl.uniform2fv(translationLocation, object.position);

    // Update the vertex buffer for size if necessary
    const width = object.width || 100;
    const height = object.height || 100;
    const vertices = new Float32Array([
        -width / 2, -height / 2, 0, 0,
        width / 2, -height / 2, 1, 0,
        -width / 2, height / 2, 0, 1,
        width / 2, height / 2, 1, 1
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function renderProjectiles() {
    projectiles.forEach(projectile => {
        gl.bindTexture(gl.TEXTURE_2D, projectile.texture);
        renderObject(projectile);
    });
}

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
