<!-- Development only (nuxt.config.ts removes this route from a production build): every base component of
     components/ui with its variants and states on one page, to check a change of the look in light and dark mode.
     English only and without sign-in: nobody but a developer opens it. -->
<script setup lang="ts">
import { CircleAlertIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
import { Alert, AlertDescription, AlertTitle } from '@studio/components/ui/alert'
import { Badge } from '@studio/components/ui/badge'
import { Button } from '@studio/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@studio/components/ui/card'
import { Checkbox } from '@studio/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@studio/components/ui/dialog'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@studio/components/ui/dropdown-menu'
import { Input } from '@studio/components/ui/input'
import { Label } from '@studio/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@studio/components/ui/native-select'
import { Popover, PopoverContent, PopoverTrigger } from '@studio/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@studio/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@studio/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@studio/components/ui/sheet'
import { Skeleton } from '@studio/components/ui/skeleton'
import { Switch } from '@studio/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@studio/components/ui/tabs'
import { Textarea } from '@studio/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@studio/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@studio/components/ui/tooltip'

definePageMeta({ convexAuth: false, layout: false })
useHead({ title: 'Base components · Ginko' })

const BUTTONS = ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'] as const
const BADGES = ['soft', 'outline', 'warning', 'success', 'info', 'destructive', 'default', 'secondary'] as const
const text = ref('Wiener Schnitzel')
const dish = ref('schnitzel')
const sort = ref('name')
const sold = ref(true)
const fresh = ref(false)
const when = ref('now')
const view = ref('week')
const menuCheck = ref(true)
</script>

<template>
  <main class="mx-auto grid max-w-[960px] gap-10 px-4 py-10 min-[900px]:px-8">
    <header class="grid gap-1.5">
      <h1>Base components</h1>
      <p class="text-sm text-muted-foreground">Every variant and state of components/ui. Development only.</p>
    </header>

    <section class="grid gap-4" aria-labelledby="dev-buttons">
      <h2 id="dev-buttons">Buttons</h2>
      <div v-for="size in (['default', 'sm', 'lg'] as const)" :key="size" class="flex flex-wrap items-center gap-2">
        <span class="w-16 font-mono text-xs text-muted-foreground">{{ size }}</span>
        <Button v-for="variant in BUTTONS" :key="variant" type="button" :variant="variant" :size="size">{{ variant }}</Button>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="w-16 font-mono text-xs text-muted-foreground">icon</span>
        <Button type="button"><PlusIcon aria-hidden="true" /> Add a dish</Button>
        <Button type="button" variant="outline" size="sm"><PlusIcon aria-hidden="true" /> Add</Button>
        <Button type="button" variant="outline" size="icon" aria-label="Add"><PlusIcon aria-hidden="true" /></Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove"><Trash2Icon aria-hidden="true" /></Button>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="w-16 font-mono text-xs text-muted-foreground">disabled</span>
        <Button v-for="variant in BUTTONS" :key="variant" type="button" :variant="variant" disabled>{{ variant }}</Button>
      </div>
      <div class="flex flex-wrap items-center gap-2 rounded-lg bg-sidebar p-3">
        <span class="w-16 font-mono text-xs text-muted-foreground">on side</span>
        <Button type="button" variant="outline">outline</Button>
        <Button type="button" variant="ghost">ghost</Button>
        <Button type="button" variant="secondary">secondary</Button>
      </div>
    </section>

    <section class="grid gap-4" aria-labelledby="dev-badges">
      <h2 id="dev-badges">Badges</h2>
      <div class="flex flex-wrap items-center gap-2">
        <Badge v-for="variant in BADGES" :key="variant" :variant="variant">{{ variant }}</Badge>
      </div>
    </section>

    <section class="grid gap-4" aria-labelledby="dev-fields">
      <h2 id="dev-fields">Fields</h2>
      <div class="grid gap-4 min-[700px]:grid-cols-2">
        <div class="grid content-start gap-1.5">
          <Label for="dev-input">Input</Label>
          <Input id="dev-input" v-model="text" />
          <p class="text-[13px] text-muted-foreground">A hint under the field.</p>
        </div>
        <div class="grid content-start gap-1.5">
          <Label for="dev-empty">Input, empty</Label>
          <Input id="dev-empty" placeholder="Name of the dish" />
        </div>
        <div class="grid content-start gap-1.5">
          <Label for="dev-invalid">Input, invalid</Label>
          <Input id="dev-invalid" model-value="18,9o" aria-invalid="true" aria-describedby="dev-invalid-error" />
          <p id="dev-invalid-error" class="text-[13px] font-medium text-destructive">Enter a price, for example 18,90.</p>
        </div>
        <div class="grid content-start gap-1.5">
          <Label for="dev-disabled">Input, disabled</Label>
          <Input id="dev-disabled" model-value="Tafelspitz" disabled />
        </div>
        <div class="grid content-start gap-1.5">
          <Label for="dev-select">Select</Label>
          <Select v-model="dish">
            <SelectTrigger id="dev-select" class="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="schnitzel">Wiener Schnitzel</SelectItem>
              <SelectItem value="tafelspitz">Tafelspitz</SelectItem>
              <SelectItem value="backhendl">Backhendl</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="grid content-start gap-1.5">
          <Label for="dev-native">Native select</Label>
          <NativeSelect id="dev-native" v-model="sort" class="w-full">
            <NativeSelectOption value="name">Name</NativeSelectOption>
            <NativeSelectOption value="price">Price</NativeSelectOption>
          </NativeSelect>
        </div>
        <div class="grid gap-1.5 min-[700px]:col-span-2">
          <Label for="dev-textarea">Textarea</Label>
          <Textarea id="dev-textarea" model-value="Breaded veal, with potato salad and lingonberries." />
        </div>
        <div class="flex items-center gap-2 min-[700px]:col-span-2">
          <Input aria-label="Search" type="search" placeholder="Search …" class="max-w-72" />
          <Button type="button" size="lg">lg beside a field</Button>
          <Button type="button" variant="outline">default beside a field</Button>
        </div>
      </div>
    </section>

    <section class="grid gap-4" aria-labelledby="dev-checked">
      <h2 id="dev-checked">Checked controls</h2>
      <div class="flex flex-wrap items-center gap-x-8 gap-y-3">
        <Label for="dev-check-on"><Checkbox id="dev-check-on" v-model="sold" /> Sold out today</Label>
        <Label for="dev-check-off"><Checkbox id="dev-check-off" v-model="fresh" /> New on the menu</Label>
        <Label for="dev-check-dis" class="opacity-60"><Checkbox id="dev-check-dis" :model-value="true" disabled /> Disabled</Label>
      </div>
      <div class="flex flex-wrap items-center gap-x-8 gap-y-3">
        <Label for="dev-switch-on"><Switch id="dev-switch-on" v-model="sold" /> Sold out today</Label>
        <Label for="dev-switch-off"><Switch id="dev-switch-off" v-model="fresh" /> New on the menu</Label>
        <Label for="dev-switch-dis" class="opacity-60"><Switch id="dev-switch-dis" :model-value="true" disabled /> Disabled</Label>
      </div>
      <RadioGroup v-model="when" class="flex flex-wrap gap-2" aria-label="When">
        <Label for="dev-radio-now" class="min-h-10 cursor-pointer gap-2 rounded-lg border border-input px-3 py-2 has-[[data-state=checked]]:border-ring has-[[data-state=checked]]:bg-accent"><RadioGroupItem id="dev-radio-now" value="now" /> Now</Label>
        <Label for="dev-radio-later" class="min-h-10 cursor-pointer gap-2 rounded-lg border border-input px-3 py-2 has-[[data-state=checked]]:border-ring has-[[data-state=checked]]:bg-accent"><RadioGroupItem id="dev-radio-later" value="later" /> Later</Label>
      </RadioGroup>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked class="size-4"> Native checkbox</label>
    </section>

    <section class="grid gap-4" aria-labelledby="dev-tabs">
      <h2 id="dev-tabs">Tabs and segmented toggle</h2>
      <Tabs default-value="dish">
        <TabsList>
          <TabsTrigger value="dish">Dish</TabsTrigger>
          <TabsTrigger value="allergens">Allergens</TabsTrigger>
          <TabsTrigger value="picture">Picture</TabsTrigger>
          <TabsTrigger value="off" disabled>Disabled</TabsTrigger>
        </TabsList>
        <TabsContent value="dish" class="pt-4 text-sm text-muted-foreground">The fields of the group “Dish”.</TabsContent>
        <TabsContent value="allergens" class="pt-4 text-sm text-muted-foreground">The fields of the group “Allergens”.</TabsContent>
        <TabsContent value="picture" class="pt-4 text-sm text-muted-foreground">The fields of the group “Picture”.</TabsContent>
      </Tabs>
      <div class="flex flex-wrap items-center gap-3">
        <ToggleGroup v-model="view" type="single" variant="segmented" aria-label="View">
          <ToggleGroupItem value="day">Day</ToggleGroupItem>
          <ToggleGroupItem value="week">Week</ToggleGroupItem>
          <ToggleGroupItem value="month">Month</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup v-model="view" type="single" variant="segmented" size="sm" aria-label="View, small">
          <ToggleGroupItem value="day">Day</ToggleGroupItem>
          <ToggleGroupItem value="week">Week</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup v-model="view" type="single" variant="outline" aria-label="View, outline">
          <ToggleGroupItem value="day">Day</ToggleGroupItem>
          <ToggleGroupItem value="week">Week</ToggleGroupItem>
        </ToggleGroup>
        <Button type="button" variant="outline">A button, for the height</Button>
      </div>
    </section>

    <section class="grid gap-4" aria-labelledby="dev-overlays">
      <h2 id="dev-overlays">Dialog, sheet, menu, popover, tooltip</h2>
      <div class="flex flex-wrap items-center gap-2">
        <Dialog>
          <DialogTrigger as-child><Button type="button" variant="outline">Open dialog</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove “Gansl-Essen”?</DialogTitle>
              <DialogDescription>The event goes to the trash. You can restore it for 30 days.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost">Cancel</Button>
              <Button type="button" variant="destructive">Remove</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Sheet>
          <SheetTrigger as-child><Button type="button" variant="outline">Open sheet</Button></SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Change a price</SheetTitle>
              <SheetDescription>Wiener Schnitzel, now € 18,90 on the website.</SheetDescription>
            </SheetHeader>
            <div class="grid gap-1.5 px-4">
              <Label for="dev-sheet-price">New price</Label>
              <Input id="dev-sheet-price" model-value="19,50" />
            </div>
          </SheetContent>
        </Sheet>
        <DropdownMenu>
          <DropdownMenuTrigger as-child><Button type="button" variant="outline">Open menu</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-56">
            <DropdownMenuLabel>Wiener Schnitzel</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Change a price</DropdownMenuItem>
            <DropdownMenuItem>Duplicate</DropdownMenuItem>
            <DropdownMenuCheckboxItem v-model="menuCheck">Sold out today</DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive"><Trash2Icon aria-hidden="true" /> Remove</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Popover>
          <PopoverTrigger as-child><Button type="button" variant="outline">Open popover</Button></PopoverTrigger>
          <PopoverContent align="start" class="grid gap-2 text-sm">
            <p class="font-medium">Shown on</p>
            <p class="text-muted-foreground">Menu, Lunch menu and the start page.</p>
          </PopoverContent>
        </Popover>
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child><Button type="button" variant="outline">Tooltip</Button></TooltipTrigger>
            <TooltipContent>Opens the page on the website</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </section>

    <section class="grid gap-4" aria-labelledby="dev-surfaces">
      <h2 id="dev-surfaces">Card, alert, skeleton</h2>
      <div class="grid gap-4 min-[700px]:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lunch menu</CardTitle>
            <CardDescription>This week, 3 of 5 days filled.</CardDescription>
          </CardHeader>
          <CardContent class="grid gap-2">
            <Skeleton class="h-3 w-3/4" />
            <Skeleton class="h-3 w-1/2" />
          </CardContent>
        </Card>
        <div class="grid content-start gap-3">
          <Alert>
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Thursday and Friday are empty</AlertTitle>
            <AlertDescription>Guests see “No lunch menu” on these days.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>The change is not saved</AlertTitle>
            <AlertDescription>There is no connection. Try again.</AlertDescription>
          </Alert>
        </div>
      </div>
    </section>
  </main>
</template>
