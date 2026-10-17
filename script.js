/*  Students: Please use this week's project for Week 6: Assignment 7: Using Animation + Spritesheets. 
     You will need to modify the contents of this JavaScript file with your own code, 
     and create - or add - any other files as called for by the assignment requirements.
     When you are done, be certain to upload a .zip of your project files and submit the 
     assignment in Canvas to be graded. */
"use strict";

// simplified steps for making a Phaser-based Breakout game with one scene
// this version is ROTATED: the paddle sits on the right side and moves up/down,
// and the bricks are stacked in columns along the left side of the stage
//
// ANIMATION ADDITIONS IN THIS VERSION:
//   1) A spritesheet-driven "brick-explode" animation (4 frames) that plays
//      whenever a brick is destroyed.
//   2) A spritesheet-driven "ball-pulse" animation (4 frames) that plays on
//      the bonus ball for as long as it exists, so it visually reads as
//      "special" compared to the plain main ball.
//   3) A tween on the paddle sprite (a quick squish/scale) that fires every
//      time the ball hits it, for physical feedback.
//
// NOTE ON ASSETS: this assumes two new spritesheet image files exist in img/:
//   - img/brick_explode.png : a horizontal strip of 4 frames, 32x32 px each
//     (128x32 px total), showing a brick breaking apart across the frames.
//   - img/ball_pulse.png    : a horizontal strip of 4 frames, 16x16 px each
//     (64x16 px total), showing the ball glowing/pulsing across the frames.
// Swap the frameWidth/frameHeight/path values below to match your actual
// art if it differs.

// 0. tweakable game settings (change these to experiment!)
const BRICK_COLUMNS = 8;        // how many columns of bricks, counting left to right
const BRICK_ROWS = 14;          // how many bricks in each column, counting top to bottom
const POINTS_PER_BRICK = 20;    // was 10
const SECOND_BALL_SCORE = 100;  // score at which a bonus ball joins the game

// 1. defining a set of game configuration properties
const config = {
  type: Phaser.WEBGL,
  width: 800,
  height: 600,
  physics: {
    default: 'arcade'
  },
  scene: {
    preload: loadGameAssets,
    create: buildGameScene,
    update: checkForLostBalls
  }
};

// 2. define global variables 
  // simple numbers to track game economy metrics like score, how balls the player has
let score_value, balls_available;
  // reference to game objects we create that we need to do stuff with from time to time
let ball, paddle, bricks, score_text;
  // the bonus ball that appears once the score reaches SECOND_BALL_SCORE
let second_ball = null;
let second_ball_added = false;

// 3. We have at least three functions to successfully create a single scene in our game: preload
function loadGameAssets() {
  // load original assets
  this.load.image('ball_image', 'img/ball.png');
  this.load.image('brick_image', 'img/brick.png');
  this.load.image('paddle_image', 'img/paddle.png');

  // spritesheet #1: 4-frame brick explosion, used for the "brick-explode" animation
  this.load.spritesheet(
    'brick_explode_sheet',
    'img/brick_explode.png',
    { frameWidth: 32, frameHeight: 32 }
  );


  // spritesheet #2: 4-frame pulsing ball, used for the "ball-pulse" animation
  this.load.spritesheet(
    'ball_pulse_sheet',
    'img/ball_pulse.png',
    { frameWidth: 16, frameHeight: 16 }
  );
}

// 4. create
function buildGameScene() {
  // make the edges of stage collidable so ball bounces off them
  // order is left, right, up, down: the RIGHT edge stays open so a missed ball can fall off behind the paddle
  this.physics.world.setBoundsCollision( true, false, true, true );

  // create the first game object: ball (starts just to the left of the paddle)
  ball = this.physics.add.sprite( 700, 300, 'ball_image' );
  ball.setCollideWorldBounds( true );
  ball.setBounce(1); // 0-1 where 1=100% of the inertial energy goes back into the ball

  // make the paddle on the right side of the stage
  paddle = this.physics.add.sprite( 750, 300, 'paddle_image' );
  paddle.setAngle( -90 );   // turn the image so it is tall instead of wide (highlighted edge faces the bricks)
  paddle.setScale( 2, 1 );  // stretches the image's long side to 88 pixels
  // Phaser physics bodies do NOT rotate with the sprite, so we set the body size by hand.
  // We want a body 8 pixels wide and 88 pixels tall on the stage. setSize() measures in
  // unscaled pixels and the x scale is 2, so the width we give is 8 / 2 = 4.
  paddle.body.setSize( 4, 88 );
  paddle.setImmovable();

  // make a group of bricks
  // each brick image is 32 x 16 pixels
  // giving gridAlign a height but NO width makes Phaser fill each column from top to bottom
  // before moving one column to the right
  // y is chosen so the columns are centered vertically on the stage
  bricks = this.physics.add.group(
    {
      key: 'brick_image',
      quantity: BRICK_COLUMNS * BRICK_ROWS,
      gridAlign: {
        height: BRICK_ROWS,
        cellWidth: 32,
        cellHeight: 32,
        x: 48,
        y: (600 - BRICK_ROWS * 32) / 2
      }
    }
  );

  // Phaser 4.2.1 syntax for iterating over a group of objects (replaces iterate)
  bricks.children.forEach(
    function(one_brick) {
      one_brick.setImmovable();
    }
  );

  // --- ANIMATION DEFINITIONS -------------------------------------------
  // animation sequence #1: brick explosion (4 frames, plays once, no loop)
  this.anims.create({
    key: 'brick-explode',
    frames: this.anims.generateFrameNumbers('brick_explode_sheet', { start: 0, end: 3 }),
    frameRate: 12,
    repeat: 0
  });

  // animation sequence #2: pulsing bonus ball (4 frames, loops forever)
  this.anims.create({
    key: 'ball-pulse',
    frames: this.anims.generateFrameNumbers('ball_pulse_sheet', { start: 0, end: 3 }),
    frameRate: 8,
    repeat: -1
  });
  // -----------------------------------------------------------------------

  // now establish the collisions we care about detecting: 

    // ball touches paddle
    this.physics.add.collider( ball, paddle, onBallHitPaddle, null, this );

    // ball touches a brick in the bricks group
    this.physics.add.collider( ball, bricks, onBallHitBrick, null, this );

  // manage user input using on() event handler
  this.input.on( 'pointermove', followPointerWithPaddle, this );
  this.input.on( 'pointerup', serveBall, this );

  // initialze some numeric values for score, and balls
  score_value = 0;
  balls_available = 3;
  second_ball = null;
  second_ball_added = false;

  // create a text game object to display score value
  score_text = this.add.text( 16, 16, score_value );
}

// 5. update (run every frame of game loop)
function checkForLostBalls() {
  // main ball: going off the right edge costs the player one of their balls
  if ( ball.x > 800 ) {
    console.log('ball lost!');
    balls_available--;
    if (balls_available > 0) {
      ball.x = 700;
      ball.y = 300;
      ball.setVelocity(0,0);
    } else {
      console.log('game over!');
      ball.x = 800;
      ball.setVelocity(0,0);
    }
  }

  // bonus ball: if it goes off the right edge it simply disappears (no penalty)
  if ( second_ball !== null && second_ball.x > 800 ) {
    console.log('bonus ball lost!');
    second_ball.destroy();
    second_ball = null;
  }
}

// 6. Create a new phaser game object
const mygame = new Phaser.Game( config );

// 7. We might also define other custom functions

// custom event handler called by phaser during game loop when ball + paddle touch
function onBallHitPaddle() {
  console.log('ball hit paddle');

  // TWEEN: quick squish-and-recover on the paddle's horizontal scale, so the
  // paddle visibly reacts to every hit. "this" is the scene because it was
  // passed as the collider's callback context below.
  this.tweens.add({
    targets: paddle,
    scaleX: { from: 2.4, to: 2 },   // paddle's normal scaleX is 2 (set in buildGameScene)
    duration: 150,
    ease: 'Sine.easeOut'
  });
}

// the paddle now slides up and down, so it follows the pointer's y position
function followPointerWithPaddle( pointer ) {
  paddle.y = pointer.y;
}

function onBallHitBrick( ball_hit, brick_hit ) {
  // play the brick-explode animation at the brick's position using a
  // throwaway sprite, then clean that sprite up once the animation finishes
  const explosion = this.add.sprite( brick_hit.x, brick_hit.y, 'brick_explode_sheet' );
  explosion.play('brick-explode');
  explosion.on('animationcomplete', function () {
    explosion.destroy();
  });

  brick_hit.disableBody(true, true);
  score_value = score_value + POINTS_PER_BRICK;
  score_text.setText(score_value);
  console.log(score_value);

  // once the score reaches the target, add the bonus ball (only once)
  // "this" is the scene because we passed it as the callback context to the collider
  if ( score_value >= SECOND_BALL_SCORE && !second_ball_added ) {
    spawnBonusBall.call( this );
  }
}

function spawnBonusBall() {
  second_ball_added = true;

  // start the bonus ball just to the left of the paddle and send it left and down
  // uses the ball-pulse spritesheet/animation so it reads as visually distinct
  // from the plain main ball
  second_ball = this.physics.add.sprite( paddle.x - 50, paddle.y, 'ball_pulse_sheet' );
  second_ball.play('ball-pulse');
  second_ball.setCollideWorldBounds( true );
  second_ball.setBounce(1);
  second_ball.setVelocity( -300, 75 );

  // the bonus ball needs its own collisions with the paddle and the bricks
  this.physics.add.collider( second_ball, paddle, onBallHitPaddle, null, this );
  this.physics.add.collider( second_ball, bricks, onBallHitBrick, null, this );

  console.log('second ball added!');
}

function serveBall() {
  if (balls_available > 0) {
    // launch toward the bricks on the left (the old velocity of -75, -300 turned sideways)
    ball.setVelocity( -300, -75 );
  }
}
