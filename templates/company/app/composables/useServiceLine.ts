/** The service line (content/serviceLine.md): the phone and email of the person who answers it, from content/people/,
 *  and when it answers (`hourGroups`: the hours split at ", ", so a day group such as "Sat 8:00–12:00" never breaks). Undefined while that person has no phone. */
export function useServiceLine() {
  const line = useGinko('serviceLine')
  const people = useGinko('people')
  return computed(() => {
    const person = people.value.items.find((item) => item.id === line.value.data.contact)?.data
    return person?.phone ? { phone: person.phone, email: person.email || undefined, hours: line.value.data.hours, hourGroups: line.value.data.hours.split(', ') } : undefined
  })
}
