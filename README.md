link-duplicates
---------------

Detect duplicate files and hard link them

```
link-duplicates /path/to/dedupe1 /path/to/dedupe2
```

This looks for all of the files in the specified paths for duplicates and
creates hard links between any it finds.

It ignores anything that's not a plain file– block devices, character devices, symbolic links, FIFOs, Sockets…

It ignores files smaller than 100 bytes.

It considers files duplicates if they:

1. Are the same file size.
2. AND, the first and last MB of the files have the same adler-32 checksum and crc-32.

Given all of those, it will unlink one of the existing copies and hard link it back into place.
