#!/usr/bin/env bash

# Multi-version build script for Phan-in-Browser
# Builds multiple PHP and Phan version combinations

set -xeu

# Configuration
PHP_VERSIONS=("8.1.31" "8.2.27" "8.3.16" "8.4.2" "8.5.0RC1")
AST_VERSION="1.1.2"
AST_PATH="ast-$AST_VERSION"

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
        echo "Downloading Phan $version release"
        wget "https://github.com/phan/phan/releases/download/${version}/phan.phar" -O "$phar_name"
    fi

    # Verify the phar works
    php "$phar_name" --version || {
        echo "Downloaded phar is corrupt!"
        rm "$phar_name"
        exit 1
    }

    echo "$phar_name"
}

# Function to build a Phan phar from a git branch
build_phan_from_git() {
    local branch=$1
    local version_label=$2  # e.g., "v5-dev" or "v6-dev"
    local phan_git_dir="phan-git-${version_label}"
    local phar_name="phan-${version_label}.phar"

    if [ ! -e "$phar_name" ]; then
        echo "Building Phan from git branch: $branch"

        if [ ! -d "$phan_git_dir" ]; then
            git clone --depth 1 --branch "$branch" https://github.com/phan/phan.git "$phan_git_dir"
        else
            (cd "$phan_git_dir" && git pull)
        fi

        # Build the phar
        (
            cd "$phan_git_dir"
            composer install --no-dev --optimize-autoloader
            php scripts/dump_markdown_preview || true  # May not exist in all versions
            php scripts/build_phar.php || {
                # Try alternative build method
                composer build-phar || {
                    echo "Failed to build phar from git"
                    exit 1
                }
            }

            # Find the generated phar
            if [ -f "phan.phar" ]; then
                cp phan.phar "../$phar_name"
            elif [ -f "build/phan.phar" ]; then
                cp build/phan.phar "../$phar_name"
            else
                echo "Could not find built phar"
                exit 1
            fi
        )

        # Verify the phar works
        php "$phar_name" --version || {
            echo "Built phar is corrupt!"
            rm "$phar_name"
            exit 1
        }
    fi

    echo "$phar_name"
}

# Function to build PHP + Phan combination
build_php_phan_combo() {
    local php_version=$1
    local phan_phar=$2
    local phan_version=$3

    local php_short=$(get_short_version "$php_version")
    local php_path="php-${php_version}"
    local output_dir="${BUILD_ROOT}/php-${php_short}/phan-${phan_version}"

    echo "========================================"
    echo "Building PHP ${php_version} + Phan ${phan_version}"
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

    # Apply error handler patch
    echo "Applying error handler patch"
    cp main.c "${php_path}/main/main.c"

    # Download and setup ast extension if needed
    if [ ! -d "${php_path}/ext/ast" ]; then
        if [ ! -f "${AST_PATH}.tgz" ]; then
            echo "Downloading ast extension"
            wget "https://pecl.php.net/get/${AST_PATH}.tgz" -O "${AST_PATH}.tgz"
        fi
        tar zxf "${AST_PATH}.tgz"
        mv "$AST_PATH" "${php_path}/ext/ast"
    fi

    # Copy phan phar into PHP source directory
    cp "$phan_phar" "${php_path}/"
    local phar_basename=$(basename "$phan_phar")

    # Configure and build
    echo "Configuring PHP ${php_version}"
    export CFLAGS='-O3 -DZEND_MM_ERROR=0'

    (
        cd "$php_path"
        ./buildconf --force

        set +e
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
          --enable-tokenizer

        if [ $? -ne 0 ]; then
            echo "emconfigure failed. Content of config.log:"
            cat config.log
            exit 1
        fi

        set -e

        echo "Building PHP ${php_version}"
        emmake make clean
        emmake make -j$(nproc)

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

# Development v5 (from master branch - HEAD)
PHAN_V5_DEV_PHAR=$(build_phan_from_git "$PHAN_V5_DEV_BRANCH" "v5-dev")

# Development v6 (from master branch - assuming v6 dev is also in master for now)
# Note: If there's a separate v6 branch, update PHAN_V6_DEV_BRANCH
PHAN_V6_DEV_PHAR=$(build_phan_from_git "$PHAN_V6_DEV_BRANCH" "v6-dev")

# Build all combinations
# For efficiency, we can choose which combinations to build
# Building all combinations (5 PHP versions × 3 Phan versions = 15 builds) might be excessive
# Let's build strategic combinations:

echo "Building PHP + Phan combinations..."

for php_version in "${PHP_VERSIONS[@]}"; do
    # Build each PHP version with released Phan v5
    build_php_phan_combo "$php_version" "$PHAN_V5_PHAR" "$PHAN_V5_RELEASED"

    # Build each PHP version with v5 dev
    build_php_phan_combo "$php_version" "$PHAN_V5_DEV_PHAR" "v5-dev"

    # Build each PHP version with v6 dev
    build_php_phan_combo "$php_version" "$PHAN_V6_DEV_PHAR" "v6-dev"
done

echo "========================================"
echo "Build complete!"
echo "========================================"
echo "Built outputs are in: ${BUILD_ROOT}/"
echo ""
echo "Next steps:"
echo "1. Update index.html to add version selectors"
echo "2. Update static/demo.js to load the correct version files"
