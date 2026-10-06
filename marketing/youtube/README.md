# YouTube

One folder per video, named by the date it goes up, plus the channel's own art and Shorts.

```
youtube/
  channel/                         banner, profile picture, end screen, channel description
  shorts/                          description template for Shorts
  2026-10-05-how-the-overlay-works/
    video.mp4                      the upload (with end screen)
    thumbnail.png                  the chosen thumbnail
    thumbnail/                     variants and the files that build them
    description.md                 title, description, chapters, tags
    footage/                       raw recordings
  2026-10-05-saturday-tempted/
    script.md
    description.md
    thumbnail.png
    thumbnail/
    graphics/                      slides in script order, shotlist.md
```

A new video gets a new dated folder with the same shape. Video files (.mp4, .mov) stay out of git.
Rebuild scripts run from the repo root, e.g. `npx tsx marketing/youtube/channel/shoot-endscreen.mts`.
Logos come from `public/brand/`, never redrawn.
