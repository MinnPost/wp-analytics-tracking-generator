// Require our dependencies
const autoprefixer = require('autoprefixer');
const babel = require('gulp-babel');
const browserSync = require('browser-sync').create();
const concat = require('gulp-concat');
const cssnano = require('cssnano');
const fs = require('fs');
const gulp = require('gulp');
const packagejson = JSON.parse(fs.readFileSync('./package.json'));
const mqpacker = require( 'css-mqpacker' );
const order = require( 'gulp-order' );
const plumber = require('gulp-plumber');
const postcss = require('gulp-postcss');
const rename = require('gulp-rename');
const sass = require('gulp-sass');
const sassGlob = require('gulp-sass-glob');
const sort = require( 'gulp-sort' );
const sourcemaps = require('gulp-sourcemaps');
const uglify = require('gulp-uglify');
const wpPot = require('gulp-wp-pot');

// Some config data for our tasks
const config = {
  styles: {
    admin_src: 'assets/sass/*.scss',
    dest: './assets/css'
  },
  scripts: {
    admin_src: './assets/js/src/admin/**/*.js',
    front_end_src: [ './assets/js/src/front-end/**/*.js' ],
    uglify: [ 'assets/js/*.js', '!assets/js/*.min.js' ],
    dest: './assets/js'
  },
  languages: {
    src: [ './**/*.php', '!vendor/*' ],
    dest: './languages/' + packagejson.name + '.pot'
  },
  browserSync: {
    active: false,
    localURL: 'mylocalsite.local'
  }
};

function adminstyles() {
  return gulp.src(config.styles.admin_src, { allowEmpty: true })
    .pipe(sourcemaps.init()) // Sourcemaps need to init before compilation
    .pipe(sassGlob()) // Allow for globbed @import statements in SCSS
    .pipe(sass()) // Compile
    .on('error', sass.logError) // Error reporting
    .pipe(postcss([
      mqpacker( {
        'sort': true
      } ),
      autoprefixer(),
      cssnano( {
        'safe': true // Use safe optimizations.
      } ) // Minify
    ]))
    .pipe(rename({ // Rename to .min.css
      suffix: '.min'
    }))
    .pipe(sourcemaps.write()) // Write the sourcemap files
    .pipe(gulp.dest(config.styles.dest)) // Drop the resulting CSS file in the specified dir
    .pipe(browserSync.stream());
}

function adminscripts() {
  return gulp.src(config.scripts.admin_src, { allowEmpty: true })
    .pipe(sourcemaps.init())
    .pipe(babel({
      presets: ['@babel/preset-env']
    }))
    .pipe(concat(packagejson.name + '-admin.js')) // Concatenate
    .pipe(sourcemaps.write())
    .pipe(gulp.dest(config.scripts.dest))
    .pipe(browserSync.stream());
}

function frontendscripts() {
  return gulp.src(config.scripts.front_end_src)
    .pipe(order([
      'vendor/**/*.js',  // other files in the ./src/vendor directory
      'front-end/**/*.js' // files in the ./src/front-end directory
    ])
    )
    .pipe(sourcemaps.init())
    .pipe(babel({
      presets: ['@babel/preset-env']
    }))
    .pipe(concat( packagejson.name + '-front-end.js')) // Concatenate
    .pipe(sourcemaps.write())
    .pipe(gulp.dest(config.scripts.dest))
    .pipe(browserSync.stream());
}

function uglifyscripts() {
  return gulp.src(config.scripts.uglify)
    .pipe(uglify()) // Minify + compress
    .pipe(rename({
      suffix: '.min'
    }))
    //.pipe(sourcemaps.write())
    .pipe(gulp.dest(config.scripts.dest))
    .pipe(browserSync.stream());
}

// Generates translation file.
function translate() {
    return gulp
      .src( config.languages.src )
      .pipe( wpPot( {
        domain: packagejson.name,
        package: packagejson.name
      } ) )
      .pipe( gulp.dest( config.languages.dest ) );
}

// Injects changes into browser
function browserSyncTask() {
  if (config.browserSync.active) {
    browserSync.init({
      proxy: config.browserSync.localURL
    });
  }
}

// Reloads browsers that are using browsersync
function browserSyncReload(done) {
  browserSync.reload();
  done();
}

// Watch directories, and run specific tasks on file changes
function watch() {
  gulp.watch(config.styles.admin_src, adminstyles);
  gulp.watch(config.scripts.admin_src, adminscripts);
  
  // Reload browsersync when PHP files change, if active
  if (config.browserSync.active) {
    gulp.watch('./**/*.php', browserSyncReload);
  }
}

// define complex gulp tasks
const styles  = gulp.series(adminstyles);
const scripts = gulp.series(frontendscripts, adminscripts, uglifyscripts);
const build   = gulp.series(gulp.parallel(styles, scripts, translate));

// export tasks
exports.styles    = styles;
exports.scripts   = scripts;
exports.translate = translate;
exports.watch     = watch;
exports.default   = build;
