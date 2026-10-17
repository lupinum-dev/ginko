/** The service line (content/serviceLine.md): the phone and email of the person who answers it, from content/people/,
 *  and when it answers. Undefined while that person has no phone. */
export function useServiceLine() {
  const line = useGinko('serviceLine')
  const people = useGinko('people')
  return computed(() => {
    const person = people.value.items.find((item) => item.id === line.value.data.contact)?.data
    return person?.phone ? { phone: person.phone, email: person.email || undefined, hours: line.value.data.hours } : undefined
  })
}
