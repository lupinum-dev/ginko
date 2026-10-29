---
"@lupinum/ginko": patch
"@lupinum/ginko-content": patch
"@lupinum/ginko-components": patch
---

Fix pages moving while images load: the card image (`::card{image}`) now gets the image's width and height (`imageWidth`, `imageHeight`), and so does the enlarged image of a figure.
