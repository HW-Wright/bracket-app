import { describe, expect, it } from 'vitest'
import { entryKey, findOwnDuplicates, moveItem, normaliseEntry } from './normalise'

describe('normaliseEntry', () => {
  it.each([
    ['The Dark-Knight!', 'dark knight'],
    ['  dark   knight ', 'dark knight'],
    ['Amélie', 'amelie'],
    ['A Clockwork Orange', 'clockwork orange'],
    ['An American Werewolf', 'american werewolf'],
    ["Schindler's List", 'schindlers list'],
    ['Fast & Furious', 'fast and furious'],
    ['WALL·E', 'wall e'],
    ['Se7en', 'se7en'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseEntry(input)).toBe(expected)
  })

  it('only strips a leading article, not one inside the name', () => {
    expect(normaliseEntry('Theatre of Blood')).toBe('theatre of blood')
    expect(normaliseEntry('Beauty and the Beast')).toBe('beauty and the beast')
    expect(normaliseEntry('Them')).toBe('them')
  })
})

describe('entryKey', () => {
  it('treats case, hyphens and spacing as the same', () => {
    const keys = ['spiderman', 'Spiderman', 'Spider-Man', 'Spider Man', ' SPIDER-man! ', 'The Spider-Man'].map(entryKey)
    expect(new Set(keys)).toEqual(new Set(['spiderman']))
  })
  it('keeps genuinely different entries apart', () => {
    expect(entryKey('Spider-Man 2')).not.toBe(entryKey('Spider-Man'))
  })
})

describe('findOwnDuplicates', () => {
  it('catches Spider-Man spelled three ways', () => {
    expect(findOwnDuplicates(['spiderman', 'Heat', 'Spider-Man', 'Spiderman'])).toEqual([[0, 2, 3]])
  })

  it('groups entries that normalise the same', () => {
    expect(findOwnDuplicates(['Heat', 'The Thing', 'heat!', 'Alien', 'thing'])).toEqual([
      [0, 2],
      [1, 4],
    ])
  })
  it('ignores blanks and distinct entries', () => {
    expect(findOwnDuplicates(['', ' ', 'Heat', 'Up'])).toEqual([])
  })
})

describe('moveItem', () => {
  it('moves up and down', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
  })
  it('is a no-op out of bounds', () => {
    const items = ['a', 'b']
    expect(moveItem(items, 0, -1)).toBe(items)
    expect(moveItem(items, 1, 2)).toBe(items)
  })
})
