---
"@lupinum/ginko": minor
---

Add frames for images: `f.image(…, { aspect: '3:4' })` or named frames (`{ card: '3:2', header: '21:9' }`). `<GinkoImage>` crops to the field's frame around the photo's focus point (`frame="card"` picks a named one), the Studio shows the photo in every frame and sets the focus point in the field, and a picture in a text takes a frame too (`{aspect="4:3" fit="contain"}`, Format and Zuschnitt in the image menu).
