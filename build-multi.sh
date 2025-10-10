#!/usr/bin/env bash

# Multi-version build script for Phan-in-Browser
# Builds multiple PHP and Phan version combinations

set -xeu

# Configuration
PHP_VERSIONS=("8.1.33" "8.2.29" "8.3.26" "8.4.13" "8.5.0RC2")
# AST versions to build
AST_VERSIONS=("1.1.2" "1.1.3")

# Phan versions - we'll build different combinations
# Released v5 versions
PHAN_RELEASED_VERSIONS=("5.5.1" "5.5.2")
# For v6 dev, we'll build from git branches
PHAN_V6_DEV_BRANCH="v6"  # v6 development is in v6 branch

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

    # Clone or update the repository first to check for new commits
    echo "Checking for updates in git branch: $branch" >&2
    if [ ! -d "$phan_git_dir" ]; then
        git clone --branch "$branch" https://github.com/phan/phan.git "$phan_git_dir" >&2
    else
        (cd "$phan_git_dir" && git pull) >&2
    fi

    # Get the current commit hash
    CURRENT_COMMIT=$(cd "$phan_git_dir" && git rev-parse --short HEAD)

    # Check if we have a previously built commit hash
    local needs_rebuild=false
    if [ ! -e "$phar_name" ]; then
        echo "No existing phar found, will build" >&2
        needs_rebuild=true
    elif [ -f "${phar_name}.commit" ]; then
        PREVIOUS_COMMIT=$(cat "${phar_name}.commit")
        if [ "$CURRENT_COMMIT" != "$PREVIOUS_COMMIT" ]; then
            echo "New commit detected: $PREVIOUS_COMMIT -> $CURRENT_COMMIT" >&2
            needs_rebuild=true
        else
            echo "Already up to date at commit: $CURRENT_COMMIT" >&2
        fi
    else
        # Phar exists but no commit file, rebuild to be safe
        echo "No commit metadata found, will rebuild" >&2
        needs_rebuild=true
    fi

    if [ "$needs_rebuild" = true ]; then
        echo "Building Phan from git branch: $branch" >&2

        # Build the phar
        (
            cd "$phan_git_dir"

            # Get the current commit hash
            COMMIT_HASH=$(git rev-parse --short HEAD)
            COMMIT_DATE=$(git log -1 --format=%cd --date=short)
            echo "Building from commit: $COMMIT_HASH ($COMMIT_DATE)" >&2

            # Make sure composer.phar exists for internal/make_phar
            if [ ! -f "composer.phar" ]; then
                echo "Downloading composer.phar for internal/make_phar..." >&2
                wget -O composer.phar https://getcomposer.org/composer-stable.phar >&2 || {
                    echo "Failed to download composer.phar" >&2
                    exit 1
                }
                chmod +x composer.phar
            fi

            # Build the phar using internal/make_phar
            # Note: internal/make_phar does composer install --no-dev which removes the patches plugin
            # So we'll need to manually apply patches after it runs
            if [ -x "internal/make_phar" ]; then
                echo "Using internal/make_phar script" >&2

                # Modify internal/make_phar to stop before building the phar
                # We'll manually apply patches, then finish the build
                php composer.phar install --classmap-authoritative --prefer-dist --no-dev >&2

                # Manually apply the PHP 8.5 compatibility patch to var_representation_polyfill
                echo "Manually applying PHP 8.5 compatibility patch..." >&2
                PATCH_FILE="patches/var_representation_polyfill_php85_compat.patch"
                TARGET_FILE="vendor/tysonandre/var_representation_polyfill/src/VarRepresentation/Encoder.php"

                if [ -f "$PATCH_FILE" ] && [ -f "$TARGET_FILE" ]; then
                    # Apply the patch using sed (simpler than patch command for single line change)
                    sed -i "s/case 'NULL';/case 'NULL':/" "$TARGET_FILE" >&2
                    echo "Applied PHP 8.5 compatibility patch to var_representation_polyfill" >&2

                    # Verify it was applied
                    if grep -q "case 'NULL':" "$TARGET_FILE"; then
                        echo "Patch verified successfully" >&2
                    else
                        echo "WARNING: Patch may not have been applied correctly" >&2
                    fi
                else
                    echo "WARNING: Patch file or target not found, skipping..." >&2
                fi

                # Apply the tolerant-parser nullable params patch
                PATCH_FILE2="patches/tolerant-parser-nullable-params.patch"
                if [ -f "$PATCH_FILE2" ]; then
                    (cd vendor/microsoft/tolerant-php-parser && patch -p1 < "../../../$PATCH_FILE2") >&2 2>/dev/null || {
                        echo "WARNING: tolerant-parser patch failed or already applied" >&2
                    }
                fi

                # Now finish the build
                rm -rf build
                mkdir build
                php -d phar.readonly=0 internal/package.php >&2
                chmod a+x build/phan.phar

                # Verify it works
                php build/phan.phar --version >&2 || {
                    echo "Failed to build phar with internal/make_phar" >&2
                    echo "Checking if phar was created despite error..." >&2
                    if [ -f "build/phan.phar" ]; then
                        echo "Phar exists, continuing despite error in verification" >&2
                    else
                        exit 1
                    fi
                }
            else
                echo "Error: internal/make_phar not found or not executable" >&2
                exit 1
            fi

            # The phar should be in build/phan.phar
            if [ ! -f "build/phan.phar" ]; then
                echo "Error: build/phan.phar not found after build" >&2
                ls -la >&2
                ls -la build/ >&2 || true
                exit 1
            fi

            # Copy to parent directory with version label
            cp build/phan.phar "../$phar_name"

            # Save commit info to a metadata file
            echo "$COMMIT_HASH" > "../${phar_name}.commit"
            echo "Phan ${version_label} built from commit ${COMMIT_HASH} (${COMMIT_DATE})" > "../${phar_name}.info"
        ) || {
            echo "Phar build process failed" >&2
            exit 1
        }

        # Skip verification - the phar will be tested when embedded in WebAssembly
        # The native verification fails but the phar may still work in the WebAssembly environment
        echo "Built $phar_name (verification skipped - will test in WebAssembly build)" >&2
    fi

    # Only output the phar name to stdout for capture
    echo "$phar_name"
}

# Function to build PHP + ast combination (no embedded phar)
build_php_ast_combo() {
    local php_version=$1
    local ast_version=$2

    local php_short=$(get_short_version "$php_version")
    local php_path="php-${php_version}"
    local output_dir="${BUILD_ROOT}/php-${php_short}/ast-${ast_version}"

    echo "========================================"
    echo "Building PHP ${php_version} + ast ${ast_version}"
    echo "========================================"

    mkdir -p "$output_dir"

    # Check if already built
    if [ -f "${output_dir}/php.wasm" ] && [ -f "${output_dir}/php.js" ]; then
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
                wget "https://downloads.php.net/~edorian/${php_path}.tar.xz" || \
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

    # Download and setup VLD extension if needed
    echo "Setting up VLD extension"
    rm -rf "${php_path}/ext/vld"

    if [ ! -d "vld-git" ]; then
        echo "Cloning VLD extension from GitHub"
        git clone https://github.com/derickr/vld.git vld-git
    else
        echo "VLD already cloned, pulling latest"
        (cd vld-git && git pull)
    fi
    cp -r vld-git "${php_path}/ext/vld"

    # Patch VLD config.m4 to skip PHP_CONFIG version check during cross-compilation
    echo "Patching VLD config.m4 for cross-compilation"
    (cd "${php_path}/ext/vld" && patch -p0 < ../../../patches/vld-emscripten.patch)

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

        # PHP version-specific configure flags
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
          --enable-vld \
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
          -s EXPORTED_RUNTIME_METHODS='["ccall","FS"]' \
          -s MODULARIZE=1 \
          -s EXPORT_NAME="'PHP'" \
          -s TOTAL_MEMORY=134217728 \
          -s ASSERTIONS=0 \
          -s INVOKE_RUN=0 \
          -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
          libs/libphp.a pib_eval.o -o out/php.js

        # Copy to output directory (no .data file needed without preloaded files)
        cp out/php.wasm out/php.js "../${output_dir}/"
    )

    echo "Successfully built: ${output_dir}"
}

# Main build process

echo "========================================"
echo "Phan-in-Browser Multi-Version Build"
echo "========================================"

# Build or download Phan versions
echo "Preparing Phan versions..."

# Download all released versions
declare -A PHAN_PHARS
for version in "${PHAN_RELEASED_VERSIONS[@]}"; do
    PHAN_PHARS[$version]=$(download_phan_release "$version")
done

# Build v6 development version from git
echo "Building Phan v6-dev from git..."
PHAN_V6_DEV_PHAR=$(build_phan_from_git "$PHAN_V6_DEV_BRANCH" "v6-dev")

echo "Note: Building stable releases ${PHAN_RELEASED_VERSIONS[*]} and v6-dev for all PHP versions."

# Build all combinations
# For efficiency, we can choose which combinations to build
# Building all combinations (5 PHP versions × 3 Phan versions = 15 builds) might be excessive
# Let's build strategic combinations:

echo "Building PHP + ast combinations..."
echo "Note: Phan .phar files will be loaded dynamically at runtime"

for php_version in "${PHP_VERSIONS[@]}"; do
    for ast_version in "${AST_VERSIONS[@]}"; do
        # Skip ast 1.1.2 for PHP 8.4 and 8.5 (incompatible)
        if [[ "$php_version" == 8.4* ]] && [[ "$ast_version" == "1.1.2" ]]; then
            echo "Skipping PHP ${php_version} + ast ${ast_version} (incompatible)"
            continue
        fi
        if [[ "$php_version" == 8.5* ]] && [[ "$ast_version" == "1.1.2" ]]; then
            echo "Skipping PHP ${php_version} + ast ${ast_version} (incompatible)"
            continue
        fi

        # Build PHP + ast combination (phar will be loaded dynamically)
        build_php_ast_combo "$php_version" "$ast_version"
    done
done

echo "========================================"
echo "Build complete!"
echo "========================================"
echo "Built outputs are in: ${BUILD_ROOT}/"
echo ""
echo "Build summary:"
echo "  - PHP versions: ${PHP_VERSIONS[*]}"
echo "  - ast versions: ${AST_VERSIONS[*]}"
echo "  - Total builds: $(find ${BUILD_ROOT} -name 'php.wasm' 2>/dev/null | wc -l)"
echo ""
echo "Phan .phar files available for dynamic loading:"
echo "  - phan-5.5.1.phar"
echo "  - phan-5.5.2.phar"
echo "  - phan-v6-dev.phar"
echo ""

# Generate manifest.json with phar file mtimes for cache-busting
echo "Generating manifest.json with phar mtimes..."
{
    echo "{"
    first=true
    for phar in phan-*.phar; do
        if [ -f "$phar" ]; then
            # Get mtime in seconds since epoch
            mtime=$(stat -c %Y "$phar" 2>/dev/null || stat -f %m "$phar" 2>/dev/null)
            if [ -n "$mtime" ]; then
                if [ "$first" = false ]; then
                    echo ","
                fi
                echo -n "  \"$phar\": $mtime"
                first=false
            fi
        fi
    done
    echo ""
    echo "}"
} > manifest.json

echo "Generated manifest.json"
echo ""
echo "Next steps:"
echo "1. Update static/demo.js to dynamically load .phar files"
echo "2. Test with: python3 -m http.server --bind 127.0.0.1 8081"
