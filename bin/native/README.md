# Resource-free model compiler

`win32/nwnmdlcomp.exe` is the pinned optional compiler for Studio's explicit
`nwn-ee-impact-binary-experimental-v1` candidate profile. It does not run NWN,
discover a game installation, extract game resources or read Studio projects.
The worker only passes generated, validated source MDL in an isolated temporary
directory, verifies the executable SHA-256, and reads every exported geometry,
controller and animation sample back from decompiler output before publishing.

- Upstream: https://github.com/dunahan/nwnexplorer
- Source revision: `56da6dc2fe94da6bbabe83ad18670f47fccd7dfb`
- Local source checkout: `C:/Projects/Claude/nwnexplorer`
- Build: MSVC v145, Win32 Release, `nwnmdlcomp` project.
- Executable SHA-256: `5b8b49441cbc8121ff8f38ec48651e2388d54842ccc12128cf2b59f8b735739d`
- The only source change, in `nwnmdlcomp.cpp`, replaces
  `if (!g_sLoader.Initialize (...))` (game discovery) with `if (g_fExtract)`.
  Extraction is rejected; parser, compiler, serializer and decompiler are
  unchanged. The full launcher patch is distributed in `resource-free.patch`.
- Compile arguments: `-c -n -e source.mdl compiled.mdl`; decompile:
  `-d -e compiled.mdl roundtrip.mdl`. `-n` preserves authored triangles.

License, copyright, conditions and acknowledgements: `COPYING.nwn-tools.txt`.
Compilation does not qualify retail loading, normals, lighting or visibility.
Binary support is unavailable when this pinned Windows executable cannot run.

Provenance erratum: Studio 0.10.0 initially recorded the reference-study commit
`3660b18459c2c762806bc0f00458fc590b376ca9` as the build source. Studio 0.10.1
corrects it to the verified source above. The executable has not changed.
Existing candidate receipts and their hashes remain immutable; their recorded
commit must be interpreted with this erratum. All C/C++/header inputs in
_NmcLib, _NwnLib, _MathLib and nwnmdlcomp were compared to the corrected commit;
only the distributed resource-free launcher patch differs.
