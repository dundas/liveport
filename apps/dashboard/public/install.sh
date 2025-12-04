#!/bin/bash
# LivePort CLI Installer
# Usage: curl -fsSL https://liveport.dev/install.sh | bash
#
# This script installs the LivePort CLI for creating secure localhost tunnels.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# LivePort ASCII art
print_banner() {
    echo ""
    echo -e "${CYAN}"
    echo "  ╦  ╦╦  ╦╔═╗╔═╗╔═╗╦═╗╔╦╗"
    echo "  ║  ║╚╗╔╝║╣ ╠═╝║ ║╠╦╝ ║ "
    echo "  ╩═╝╩ ╚╝ ╚═╝╩  ╚═╝╩╚═ ╩ "
    echo -e "${NC}"
    echo -e "  ${BOLD}Secure localhost tunnels for AI agents${NC}"
    echo ""
}

# Detect OS and architecture
detect_platform() {
    OS="$(uname -s)"
    ARCH="$(uname -m)"

    case "$OS" in
        Linux*)     PLATFORM="linux" ;;
        Darwin*)    PLATFORM="darwin" ;;
        MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
        *)          
            echo -e "${RED}Error: Unsupported operating system: $OS${NC}"
            exit 1
            ;;
    esac

    case "$ARCH" in
        x86_64|amd64)   ARCH="x64" ;;
        arm64|aarch64)  ARCH="arm64" ;;
        *)              
            echo -e "${RED}Error: Unsupported architecture: $ARCH${NC}"
            exit 1
            ;;
    esac

    echo -e "${BLUE}Detected platform:${NC} $PLATFORM-$ARCH"
}

# Check for required tools
check_requirements() {
    local missing=()

    if ! command -v node &> /dev/null; then
        missing+=("node")
    fi

    if ! command -v npm &> /dev/null && ! command -v pnpm &> /dev/null; then
        missing+=("npm or pnpm")
    fi

    if [ ${#missing[@]} -ne 0 ]; then
        echo -e "${YELLOW}Warning: The following tools are recommended but not found:${NC}"
        for tool in "${missing[@]}"; do
            echo "  - $tool"
        done
        echo ""
        echo -e "${BLUE}Installing via npm is recommended. You can install Node.js from:${NC}"
        echo "  https://nodejs.org/"
        echo ""
        
        # Offer standalone binary installation as alternative
        read -p "Would you like to install the standalone binary instead? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            install_binary
            return
        else
            echo -e "${RED}Installation cancelled. Please install Node.js first.${NC}"
            exit 1
        fi
    fi
}

# Install via npm/pnpm
install_npm() {
    echo -e "${BLUE}Installing LivePort CLI via npm...${NC}"
    echo ""

    # Check if pnpm is available, prefer it
    if command -v pnpm &> /dev/null; then
        echo -e "${CYAN}Using pnpm...${NC}"
        pnpm add -g @liveport/cli
    else
        echo -e "${CYAN}Using npm...${NC}"
        npm install -g @liveport/cli
    fi
}

# Install standalone binary (future feature)
install_binary() {
    local VERSION="${LIVEPORT_VERSION:-latest}"
    local INSTALL_DIR="${LIVEPORT_INSTALL_DIR:-$HOME/.liveport/bin}"
    local BINARY_URL="https://github.com/dundas/liveport/releases/download/${VERSION}/liveport-${PLATFORM}-${ARCH}"

    echo -e "${BLUE}Installing LivePort CLI binary...${NC}"
    echo "  Version: $VERSION"
    echo "  Install directory: $INSTALL_DIR"
    echo ""

    # Create install directory
    mkdir -p "$INSTALL_DIR"

    # Download binary
    echo -e "${CYAN}Downloading...${NC}"
    if command -v curl &> /dev/null; then
        curl -fsSL "$BINARY_URL" -o "$INSTALL_DIR/liveport"
    elif command -v wget &> /dev/null; then
        wget -q "$BINARY_URL" -O "$INSTALL_DIR/liveport"
    else
        echo -e "${RED}Error: Neither curl nor wget found${NC}"
        exit 1
    fi

    # Make executable
    chmod +x "$INSTALL_DIR/liveport"

    # Add to PATH
    add_to_path "$INSTALL_DIR"
}

# Add directory to PATH
add_to_path() {
    local dir="$1"
    local shell_config=""

    # Detect shell config file
    if [ -n "$ZSH_VERSION" ] || [ "$SHELL" = "/bin/zsh" ]; then
        shell_config="$HOME/.zshrc"
    elif [ -n "$BASH_VERSION" ] || [ "$SHELL" = "/bin/bash" ]; then
        if [ -f "$HOME/.bashrc" ]; then
            shell_config="$HOME/.bashrc"
        elif [ -f "$HOME/.bash_profile" ]; then
            shell_config="$HOME/.bash_profile"
        fi
    fi

    if [ -n "$shell_config" ]; then
        # Check if already in PATH
        if ! grep -q "liveport" "$shell_config" 2>/dev/null; then
            echo "" >> "$shell_config"
            echo "# LivePort CLI" >> "$shell_config"
            echo "export PATH=\"\$PATH:$dir\"" >> "$shell_config"
            echo -e "${GREEN}Added $dir to PATH in $shell_config${NC}"
            echo -e "${YELLOW}Run 'source $shell_config' or restart your terminal${NC}"
        fi
    else
        echo -e "${YELLOW}Please add $dir to your PATH manually${NC}"
    fi
}

# Verify installation
verify_installation() {
    echo ""
    echo -e "${BLUE}Verifying installation...${NC}"

    if command -v liveport &> /dev/null; then
        local version=$(liveport --version 2>/dev/null || echo "installed")
        echo -e "${GREEN}✓ LivePort CLI installed successfully!${NC}"
        echo ""
        echo -e "  Version: ${BOLD}$version${NC}"
        echo ""
        return 0
    else
        echo -e "${YELLOW}LivePort CLI installed but not in PATH yet.${NC}"
        echo "  Try running: source ~/.bashrc (or ~/.zshrc)"
        echo "  Or restart your terminal."
        return 0
    fi
}

# Print next steps
print_next_steps() {
    echo -e "${BOLD}${GREEN}Installation complete!${NC}"
    echo ""
    echo -e "${BOLD}Next steps:${NC}"
    echo ""
    echo "  1. Get a bridge key from https://liveport.dev/keys"
    echo ""
    echo "  2. Connect your local server:"
    echo -e "     ${CYAN}liveport connect 3000 --key YOUR_BRIDGE_KEY${NC}"
    echo ""
    echo "  3. Your tunnel URL will be displayed (e.g., https://abc123.liveport.online)"
    echo ""
    echo -e "${BOLD}Documentation:${NC} https://liveport.dev/docs"
    echo -e "${BOLD}Dashboard:${NC}     https://liveport.dev/dashboard"
    echo ""
}

# Main installation flow
main() {
    print_banner
    detect_platform
    echo ""
    check_requirements
    install_npm
    verify_installation
    print_next_steps
}

# Run main
main
