{
  lib,
  buildNpmPackage,
  makeWrapper,
  nodejs_24,
  nodejs-slim_24,
}:

buildNpmPackage {
  pname = "outline";
  version = (lib.importJSON ../package.json).version;

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../package.json
      ../package-lock.json
      ../tsconfig.json
      ../vite.node.config.ts
      ../cli
      ../server
      ../src
    ];
  };

  nodejs = nodejs_24;
  npmDepsHash = "sha256-zSeQCj8iJU7zS00Xk2Jpc7UT5N38sy+xUFClmpmJEJ4=";
  nativeBuildInputs = [ makeWrapper ];

  buildPhase = ''
    runHook preBuild
    npx vite build -c vite.node.config.ts
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    install -Dm644 dist-node/outline.mjs $out/lib/outline/outline.mjs
    makeWrapper ${lib.getExe nodejs-slim_24} $out/bin/outline \
      --add-flags $out/lib/outline/outline.mjs
    runHook postInstall
  '';

  meta = {
    description = "Read and change the synced outliner-lab outline from a shell";
    mainProgram = "outline";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
}
