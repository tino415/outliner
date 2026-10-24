{
  lib,
  buildNpmPackage,
  makeWrapper,
  nodejs_24,
  nodejs-slim_24,
  buildCommit ? "nix",
}:

buildNpmPackage {
  pname = "outline";
  version = (lib.importJSON ../package.json).version;

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../index.html
      ../package.json
      ../package-lock.json
      ../tsconfig.json
      ../vite.node.config.ts
      ../vite.config.ts
      ../cli
      ../public
      ../server
      ../src
    ];
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-PJFdkFDy/Z1y2BPHXereUdI1YLqtDQDKtwsChVh3s9g=";
  nativeBuildInputs = [ makeWrapper ];

  buildPhase = ''
    runHook preBuild
    BUILD_COMMIT=${buildCommit} npx vite build
    npm run build:node
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    install -Dm644 dist-node/outline.mjs $out/lib/outline/outline.mjs
    install -Dm644 dist-node/server.mjs $out/lib/outline/server.mjs
    mkdir -p $out/share/outline
    cp -r dist $out/share/outline/app
    makeWrapper ${lib.getExe nodejs-slim_24} $out/bin/outline \
      --add-flags $out/lib/outline/outline.mjs
    makeWrapper ${lib.getExe nodejs-slim_24} $out/bin/outline-sync-server \
      --add-flags $out/lib/outline/server.mjs
    runHook postInstall
  '';

  meta = {
    description = "Read and change the synced outliner-lab outline from a shell, and the sync server it talks to, which can also serve the app";
    mainProgram = "outline";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
}
