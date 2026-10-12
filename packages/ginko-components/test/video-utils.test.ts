import { describe, expect, test } from 'vitest'
import { embedUrl, parseVideoUrl, type VideoSource } from '../src/runtime/components/video-utils.ts'

const yt = (id: string, start?: number): Extract<VideoSource, { kind: 'youtube' }> => ({ kind: 'youtube', id, start })

describe('parseVideoUrl', () => {
  test.each<[string, string, number | undefined, VideoSource | undefined]>([
    ['youtube watch', 'https://www.youtube.com/watch?v=M7lc1UVf-VE', undefined, yt('M7lc1UVf-VE')],
    ['youtube watch with t', 'https://www.youtube.com/watch?v=M7lc1UVf-VE&t=90s', undefined, yt('M7lc1UVf-VE', 90)],
    ['youtube t as 1m30s', 'https://youtube.com/watch?v=M7lc1UVf-VE&t=1m30s', undefined, yt('M7lc1UVf-VE', 90)],
    ['youtube mobile', 'https://m.youtube.com/watch?v=M7lc1UVf-VE', undefined, yt('M7lc1UVf-VE')],
    ['youtu.be share', 'https://youtu.be/M7lc1UVf-VE?si=abc&t=15', undefined, yt('M7lc1UVf-VE', 15)],
    ['youtube shorts', 'https://www.youtube.com/shorts/M7lc1UVf-VE', undefined, yt('M7lc1UVf-VE')],
    ['youtube embed', 'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE', undefined, yt('M7lc1UVf-VE')],
    ['start prop wins over the URL', 'https://youtu.be/M7lc1UVf-VE?t=15', 42, yt('M7lc1UVf-VE', 42)],
    ['youtube without a valid id', 'https://www.youtube.com/watch?v=x', undefined, { kind: 'link', url: 'https://www.youtube.com/watch?v=x' }],
    ['vimeo', 'https://vimeo.com/123456789', undefined, { kind: 'vimeo', id: '123456789', hash: undefined, start: undefined }],
    ['vimeo unlisted hash', 'https://vimeo.com/123456789/abcdef1234', undefined, { kind: 'vimeo', id: '123456789', hash: 'abcdef1234', start: undefined }],
    ['vimeo player with time', 'https://player.vimeo.com/video/123456789#t=20s', undefined, { kind: 'vimeo', id: '123456789', hash: undefined, start: 20 }],
    ['mp4 file', 'https://cdn.example.org/a/film.mp4?x=1', undefined, { kind: 'file', url: 'https://cdn.example.org/a/film.mp4?x=1' }],
    ['site file', '/media/film.webm', undefined, { kind: 'file', url: '/media/film.webm' }],
    ['unknown host', 'https://example.org/watch?v=M7lc1UVf-VE', undefined, { kind: 'link', url: 'https://example.org/watch?v=M7lc1UVf-VE' }],
    ['lookalike host', 'https://youtube.com.evil.example/watch?v=M7lc1UVf-VE', undefined, { kind: 'link', url: 'https://youtube.com.evil.example/watch?v=M7lc1UVf-VE' }],
    ['javascript url', 'javascript:alert(1)', undefined, undefined],
    ['data url', 'data:text/html,<script>alert(1)</script>', undefined, undefined],
    ['protocol-relative', '//evil.example/film.mp4', undefined, undefined],
    ['not a url', 'film', undefined, undefined],
  ])('%s', (_name, src, start, expected) => {
    expect(parseVideoUrl(src, start)).toEqual(expected)
  })

  test('embed addresses use the privacy hosts', () => {
    expect(embedUrl(yt('M7lc1UVf-VE', 90))).toBe('https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?autoplay=1&start=90')
    expect(embedUrl({ kind: 'vimeo', id: '123456789', hash: 'abcdef1234' })).toBe('https://player.vimeo.com/video/123456789?autoplay=1&dnt=1&h=abcdef1234')
  })
})
