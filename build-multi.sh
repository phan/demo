#!/usr/bin/env bash

# Multi-version build script for Phan-in-Browser
# Builds multiple PHP and Phan version combinations

set -xeu

# Configuration
PHP_VERSIONS=("8.1.33" "8.2.29" "8.3.26" "8.4.13" "8.5.0RC1")
# AST versions to build
AST_VERSIONS=("1.1.2" "1.1.3")

# Phan versions - we'll build different combinations
# Latest released v5
PHAN_V5_RELEASED="5.5.1"
# For v5 and v6 dev, we'll build from git branches
PHAN_V5_DEV_BRANCH="master"
PHAN_V6_DEV_BRANCH="master"  # Assuming v6 work will be in master or a v6 branch

# Output directory structure: builds/php-{VERSION}/phan-{VERSION}/
BUILD_ROOT="builds"
mkdir -p "$BUILD_ROOT"

if ! type emconfigure 2>/dev/null >/dev/null ; then
    echo "emconfigure not found. Install emconfigure and add it to your path (e.g. source emsdk/emsdk_env.sh)"
    exit 1
fi

# Function to get short version (e.g., 8.1.31 -> 81, 8.5.0beta3 -> 85)
get_short_version() {
    local version=$1
    echo "$version" | sed -E 's/^([0-9]+)\.([0-9]+).*/\1\2/'
}

# Function to download and build a Phan phar from a release
download_phan_release() {
    local version=$1
    local phar_name="phan-${version}.phar"

    if [ ! -e "$phar_name" ]; then
        echo "Downloading Phan $version release" >&2
        wget "https://github.com/phan/phan/releases/download/${version}/phan.phar" -O "$phar_name" >&2
    fi

    # Verify the phar works (send output to stderr so it doesn't pollute the return value)
    php "$phar_name" --version >&2 || {
        echo "Downloaded phar is corrupt!" >&2
        rm "$phar_name"
        exit 1
    }

    # Only output the phar name to stdout for capture
    echo "$phar_name"
}

# Function to build a Phan phar from a git branch
build_phan_from_git() {
    local branch=$1
    local version_label=$2  # e.g., "v5-dev" or "v6-dev"
    local phan_git_dir="phan-git-${version_label}"
    local phar_name="phan-${version_label}.phar"

    if [ ! -e "$phar_name" ]; then
        echo "Building Phan from git branch: $branch" >&2

        if [ ! -d "$phan_git_dir" ]; then
            git clone --depth 1 --branch "$branch" https://github.com/phan/phan.git "$phan_git_dir" >&2
        else
            (cd "$phan_git_dir" && git pull) >&2
        fi

        # Build the phar
        (
            cd "$phan_git_dir"

            # Try to build the phar - different Phan versions use different methods
            if [ -f "internal/package.php" ]; then
                echo "Using Phan's internal/package.php (modern Phan)" >&2

                # Clean and reinstall dependencies to ensure fresh autoloader
                rm -rf vendor/
                composer install --classmap-authoritative --prefer-dist --no-dev >&2 || {
                    echo "Composer install failed" >&2
                    exit 1
                }

                # Verify vendor directory is populated
                if [ ! -f "vendor/autoload.php" ]; then
                    echo "Error: vendor/autoload.php not found after composer install" >&2
                    exit 1
                fi

                # Build the phar
                rm -rf build
                mkdir -p build
                php -d phar.readonly=0 internal/package.php >&2 || {
                    echo "Failed to build phar with internal/package.php" >&2
                    exit 1
                }

                # Make it executable
                chmod +x build/phan.phar

                # Verify the phar works
                echo "Verifying built phar..." >&2
                php build/phan.phar --version >&2 || {
                    echo "Built phar doesn't work - checking contents" >&2
                    # Debug: list what's in the phar
                    php -r "
                        \$phar = new Phar('build/phan.phar');
                        echo 'Phar contains ' . count(\$phar) . ' files\n';
                        echo 'Has vendor/autoload.php: ' . (isset(\$phar['vendor/autoload.php']) ? 'yes' : 'no') . '\n';
                        echo 'Has src/Phan/CLI.php: ' . (isset(\$phar['src/Phan/CLI.php']) ? 'yes' : 'no') . '\n';
                    " >&2 || true
                    exit 1
                }
            elif [ -f "scripts/build_phar.php" ]; then
                echo "Using scripts/build_phar.php (older Phan)" >&2
                composer install --no-dev --optimize-autoloader >&2 || {
                    echo "Composer install failed" >&2
                    exit 1
                }
                php scripts/build_phar.php >&2 || {
                    echo "Failed to build phar with scripts/build_phar.php" >&2
                    exit 1
                }
            else
                echo "No known phar build method found" >&2
                echo "Available files:" >&2
                ls -la internal/ >&2 || true
                ls -la scripts/ >&2 || true
                exit 1
            fi

            # Find the generated phar
            if [ -f "phan.phar" ]; then
                cp phan.phar "../$phar_name"
            elif [ -f "build/phan.phar" ]; then
                cp build/phan.phar "../$phar_name"
            elif [ -f "dist/phan.phar" ]; then
                cp dist/phan.phar "../$phar_name"
            else
                echo "Could not find built phar in expected locations" >&2
                ls -la >&2
                exit 1
            fi
        ) || {
            echo "Phar build process failed" >&2
            exit 1
        }

        # Verify the phar works
        php "$phar_name" --version >&2 || {
            echo "Built phar is corrupt!" >&2
            rm -f "$phar_name"
            exit 1
        }

        echo "Successfully built $phar_name" >&2
    fi

    # Only output the phar name to stdout for capture
    echo "$phar_name"
}

# Function to build PHP + Phan + ast combination
build_php_phan_ast_combo() {
    local php_version=$1
    local phan_phar=$2
    local phan_version=$3
    local ast_version=$4

    local php_short=$(get_short_version "$php_version")
    local php_path="php-${php_version}"
    local output_dir="${BUILD_ROOT}/php-${php_short}/phan-${phan_version}/ast-${ast_version}"

    echo "========================================"
    echo "Building PHP ${php_version} + Phan ${phan_version} + ast ${ast_version}"
    echo "========================================"

    mkdir -p "$output_dir"

    # Check if already built
    if [ -f "${output_dir}/php.wasm" ] && [ -f "${output_dir}/php.js" ] && [ -f "${output_dir}/php.data" ]; then
        echo "Already built: ${output_dir}"
        return 0
    fi

    # Download PHP source if needed
    if [ ! -d "$php_path" ]; then
        if [ ! -e "${php_path}.tar.xz" ]; then
            echo "Downloading PHP ${php_version}"
            # Special handling for RC/beta versions from specific directories
            if [[ "$php_version" == *"RC"* ]] || [[ "$php_version" == *"beta"* ]]; then
                # Try specific maintainer directories for RC/beta versions
                wget "https://downloads.php.net/~daniels/${php_path}.tar.xz" || \
                wget "https://downloads.php.net/~jakub/${php_path}.tar.xz" || \
                wget "https://downloads.php.net/~saki/${php_path}.tar.xz" || \
                wget "https://www.php.net/distributions/${php_path}.tar.xz"
            else
                wget "https://www.php.net/distributions/${php_path}.tar.xz"
            fi
        fi
        echo "Extracting PHP source"
        tar xf "${php_path}.tar.xz"
    fi

    # Apply error handler patch (use version-specific main.c)
    # Convert short version (81, 82, etc) to dotted format (8.1, 8.2, etc)
    local version_major="${php_short:0:1}"
    local version_minor="${php_short:1}"
    local main_c_file="main-${version_major}.${version_minor}.c"

    echo "Applying error handler patch: ${main_c_file}"
    if [ ! -f "$main_c_file" ]; then
        echo "Error: $main_c_file not found!" >&2
        exit 1
    fi
    cp "$main_c_file" "${php_path}/main/main.c"

    # Download and setup ast extension if needed
    local ast_path="ast-${ast_version}"

    # Remove any existing ast extension to ensure clean build
    rm -rf "${php_path}/ext/ast"

    if [ ! -f "${ast_path}.tgz" ]; then
        echo "Downloading ast extension ${ast_version}"
        wget "https://pecl.php.net/get/${ast_path}.tgz" -O "${ast_path}.tgz"
    fi
    echo "Extracting ast extension ${ast_version}"
    tar zxf "${ast_path}.tgz"
    mv "$ast_path" "${php_path}/ext/ast"

    # Copy phan phar into PHP source directory
    cp "$phan_phar" "${php_path}/"
    local phar_basename=$(basename "$phan_phar")

    # Configure and build
    echo "Configuring PHP ${php_version}"

    # PHP 8.5 needs HAVE_REALLOCARRAY defined since emscripten provides it
    if [[ "$php_version" == 8.5* ]]; then
        export CFLAGS='-O3 -DZEND_MM_ERROR=0 -DHAVE_REALLOCARRAY=1'
    else
        export CFLAGS='-O3 -DZEND_MM_ERROR=0'
    fi

    (
        cd "$php_path"
        ./buildconf --force

        set +e

        # PHP 8.5 specific configure flags
        local extra_flags=""
        if [[ "$php_version" == 8.5* ]]; then
            extra_flags="--disable-opcache-jit"
        fi

        emconfigure ./configure \
          --disable-all \
          --disable-cgi \
          --disable-cli \
          --disable-rpath \
          --disable-phpdbg \
          --with-valgrind=no \
          --without-pear \
          --without-valgrind \
          --without-pcre-jit \
          --with-layout=GNU \
          --enable-ast \
          --enable-bcmath \
          --enable-ctype \
          --enable-embed=static \
          --enable-filter \
          --enable-json \
          --enable-phar \
          --enable-mbstring \
          --disable-mbregex \
          --disable-fiber-asm \
          --enable-tokenizer \
          $extra_flags

        if [ $? -ne 0 ]; then
            echo "emconfigure failed. Content of config.log:"
            cat config.log
            exit 1
        fi

        set -e

        echo "Building PHP ${php_version}"
        emmake make clean
        # Use 75% of available cores to avoid tying up the entire machine
        local cores=$(nproc)
        local build_cores=$((cores * 3 / 4))
        # Ensure at least 1 core
        if [ $build_cores -lt 1 ]; then
            build_cores=1
        fi
        echo "Using $build_cores cores (of $cores available)"
        emmake make -j$build_cores

        rm -rf out
        mkdir -p out

        emcc $CFLAGS -I . -I Zend -I main -I TSRM/ ../pib_eval.c -c -o pib_eval.o

        emcc $CFLAGS \
          --llvm-lto 2 \
          -s ENVIRONMENT=web \
          -s EXPORTED_FUNCTIONS='["_pib_eval", "_php_embed_init", "_zend_eval_string", "_php_embed_shutdown"]' \
          -s EXPORTED_RUNTIME_METHODS='["ccall"]' \
          -s MODULARIZE=1 \
          -s EXPORT_NAME="'PHP'" \
          -s TOTAL_MEMORY=134217728 \
          -s ASSERTIONS=0 \
          -s INVOKE_RUN=0 \
          -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
          --preload-file "$phar_basename" \
          libs/libphp.a pib_eval.o -o out/php.js

        # Copy to output directory
        cp out/php.wasm out/php.js out/php.data "../${output_dir}/"
    )

    echo "Successfully built: ${output_dir}"
}

# Main build process

echo "========================================"
echo "Phan-in-Browser Multi-Version Build"
echo "========================================"

# Build or download Phan versions
echo "Preparing Phan versions..."

# Released v5
PHAN_V5_PHAR=$(download_phan_release "$PHAN_V5_RELEASED")

# For now, skip building dev versions due to phar build complexity
# These can be added later once the phar build process is debugged
# Development v5 (from master branch - HEAD)
# PHAN_V5_DEV_PHAR=$(build_phan_from_git "$PHAN_V5_DEV_BRANCH" "v5-dev")

# Development v6 (from master branch - assuming v6 dev is also in master for now)
# Note: If there's a separate v6 branch, update PHAN_V6_DEV_BRANCH
# PHAN_V6_DEV_PHAR=$(build_phan_from_git "$PHAN_V6_DEV_BRANCH" "v6-dev")

echo "Note: Dev versions (v5-dev, v6-dev) are currently disabled due to phar build issues."
echo "      Only stable release $PHAN_V5_RELEASED will be used for all PHP versions."

# Build all combinations
# For efficiency, we can choose which combinations to build
# Building all combinations (5 PHP versions × 3 Phan versions = 15 builds) might be excessive
# Let's build strategic combinations:

echo "Building PHP + Phan + ast combinations..."

for php_version in "${PHP_VERSIONS[@]}"; do
    for ast_version in "${AST_VERSIONS[@]}"; do
        # Skip ast 1.1.2 for PHP 8.5 (incompatible)
        if [[ "$php_version" == 8.5* ]] && [[ "$ast_version" == "1.1.2" ]]; then
            echo "Skipping PHP ${php_version} + ast ${ast_version} (incompatible)"
            continue
        fi

        # Build each compatible PHP+ast version with released Phan v5
        build_php_phan_ast_combo "$php_version" "$PHAN_V5_PHAR" "$PHAN_V5_RELEASED" "$ast_version"

        # Dev versions disabled for now
        # build_php_phan_ast_combo "$php_version" "$PHAN_V5_DEV_PHAR" "v5-dev" "$ast_version"
        # build_php_phan_ast_combo "$php_version" "$PHAN_V6_DEV_PHAR" "v6-dev" "$ast_version"
    done
done

echo "========================================"
echo "Build complete!"
echo "========================================"
echo "Built outputs are in: ${BUILD_ROOT}/"
echo ""
echo "Next steps:"
echo "1. Update index.html to add version selectors"
echo "2. Update static/demo.js to load the correct version files"
