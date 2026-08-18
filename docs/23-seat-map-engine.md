# 23 · Flexible Venue & Seat Map Engine — target specification

> Supplied by the founder on 2026-08-18, verbatim below the rule. **This document is a
> target, not a description of what exists.** What is actually built is recorded in
> `/STATUS.md`, which includes the phase plan and the gap analysis against this spec.

---

# Developer-Ready Specification — Flexible Venue & Seat Map Engine
Build the seat-map system as a **venue-layout engine + inventory engine + pricing engine**, not as a simple "rows of seats" feature.
The architecture must support theatres, cinemas, stadiums, arenas, churches, conferences, concerts, VIP tables, buses, boats, festivals and custom venues.
## 1. Core principle: Seat ≠ Ticket Type ≠ Price
This separation is mandatory.
A physical seat such as **A12** must not permanently be an "Adult seat" or "Child seat".
The hierarchy: VENUE → AREA/SECTION → ROW/TABLE/ZONE → PHYSICAL SEAT → EVENT INVENTORY → AVAILABLE TICKET TYPES → PRICING RULE → BOOKING.
A customer can purchase A10 → Adult → £10 and A11 → Child → £5 in **one transaction**, both seats beside each other.
The system must never assume `seat.price = 10; seat.category = "adult"`. A seat is position (`id, row, number, sectionId`); ticket types (`adult £10, child £5`) are who occupies it.
## 2. Two different category concepts
**Seat/Area Category** — where the customer sits: VIP, Premium, Gold, Standard, Balcony, Stalls, Restricted View, Wheelchair, Box.
**Ticket Type / Attendee Category** — who uses the seat: Adult, Child, Student, Senior, Member, VIP Guest, Comp, Early Bird.
Seat A10 can be a Premium physical seat purchased with a Child ticket: Premium+Adult £15, Premium+Child £8, Standard+Adult £10, Standard+Child £5.
## 3. Flexible venue map builder
Visual drag-and-drop editor (Canva/Figma-style). Start blank or from templates: Theatre, Cinema, Stadium, Arena, Conference Hall, Church, Concert Hall, Nightclub, Restaurant, Banquet, Festival, Classroom, Bus/Coach, Custom.
## 4. Venue designer canvas
Infinite/expandable 2D canvas. Elements palette: Stage, Row, Seats, Section, Table, Zone, Barrier, Entrance, Exit, Toilet, Label, Shape. Everything movable, resizable, rotatable.
## 5. Multiple row shapes
Straight, Curved, Arc, Angled, Vertical, Freeform (individual seat positioning), Circular/radial. Coordinates, not row/column HTML tables: `interface SeatPosition { x: number; y: number; rotation: number }`.
## 6. Mixed seat categories within one row
A row provides a **default** category; individual seats override it (`seatCategoryId` per seat). Example: A1–A3 VIP, A4–A6 Standard, A7–A8 VIP; or wheelchair + companion mid-row.
## 7. Ticket types per seat category
Standard: Adult £10 / Child £5 / Student £7 / Senior £7. Premium: Adult £15 / Child £8 / Student £12 / Senior £12. VIP: Adult £30 / Child £20.
Price = Event + Seat Category + Ticket Type + Pricing Rule + Promotion + Fees.
## 8. Customer seat selection UX
Interactive map with availability key (Available / Selected / Sold / Reserved / Accessible). Clicking a seat opens its ticket-type chooser with per-type prices; basket lists seat + type + price per line. One booking, one payment, adjacent seats, different ticket types.
## 9. Fast family booking
"Find Seats Together": enter party (2 Adults, 3 Children) → engine finds adjacent seats optimising same row, adjacency, best category, proximity, budget, accessibility, no orphan creation → one-click select.
## 10. Prevent orphan seats
Organiser rule (default ON, switchable): reject selections that strand a single empty seat; message asks for adjacent seats without leaving one.
## 11. General admission / standing areas
Capacity-based inventory rendered as a zone on the map with live remaining count.
## 12. Hybrid venue
One event may combine VIP tables + reserved rows + standing GA simultaneously.
## 13. Tables
Round/Square/Rectangle/Custom. Chairs individually sellable, or whole-table purchase (e.g. 8 covers £400), or both (whole table £400 OR adult seat £60 / child seat £30).
## 14. Accessibility
First-class inventory: wheelchair spaces with linked companion seats (`companionSeatIds`), purchase-together rule, companion price £0 / fixed / standard.
## 15. Seat status model
AVAILABLE | HELD | RESERVED | SOLD | BLOCKED | COMP | STAFF | ACCESSIBILITY | UNAVAILABLE. HELD with TTL (default 10 min, configurable per event); payment success → SOLD, expiry/failure → AVAILABLE.
## 16. Database architecture
Entities: venues, venue_maps, sections, map_objects, rows, seats, seat_categories, events, event_maps, event_seat_inventory, ticket_types, price_rules, seat_holds, orders, order_items, tickets. Seat: id, venueMapId, sectionId, rowId, label, seatNumber, x, y, rotation, seatCategoryId, accessible.
## 17. Event inventory
Never modify the master venue seat on purchase; event-specific inventory rows (`eventId, seatId, status, seatCategoryId`) let one venue host different events with different pricing/availability.
## 18. Pricing model
`TicketType { id, eventId, name, eligibleSeatCategories, basePrice?, minAge?, maxAge?, salesStart?, salesEnd?, maxPerOrder? }` and `PriceRule { eventId, seatCategoryId, ticketTypeId, price, currency }`.
## 19. Rendering architecture
SVG for small/medium venues; Canvas/WebGL with viewport rendering for very large. Zoom, pan, pinch, hover, click, multi-select, section select, mobile gestures, auto-centre, reset, full screen. Venue-space coordinates, not screen pixels.
## 20. Builder tools
Select, Pan, Add Row/Seats/Curved Row/Section/Table/Standing Zone/Stage/Screen/Label/Entrance/Exit/Barrier/Accessibility/Shape, Delete, Duplicate, Undo, Redo. Multi-select 30 seats → set category, ticket eligibility, rename, renumber, rotate, align, distribute, spacing, delete, duplicate, block.
## 21. Automatic row generator
Row name, seat count, start number, direction, spacing, shape (straight/curve/arc), default category → generate, then adjust manually.
## 22. Automatic section generator
Rows A–Z × N seats, row/seat spacing, shape → hundreds of seats instantly.
## 23. Copy / mirror
Duplicate + mirror horizontally to build symmetric blocks.
## 24. Event-level map changes
Venue map = physical truth; event map = event-specific configuration (blocked seats, different categories, different availability) without destroying the master.
## 25. Checkout concurrency — critical
Never trust frontend availability. AVAILABLE → HELD atomically for all requested seats in one transaction; any non-available seat fails the whole hold.
## 26. Booking preserves ticket type per seat
Order items carry `{ seatId, seatCategory, ticketType, unitPrice }` per seat — the key decision enabling Adult+Child+Student+Senior side by side in one booking.
## 27. Venue object model
MapObjectType: SEAT, ROW, SECTION, TABLE, STANDING_ZONE, STAGE, SCREEN, ENTRANCE, EXIT, TOILET, BAR, FOOD, STAIRS, LIFT, ACCESSIBLE_AREA, BARRIER, LABEL, CUSTOM_SHAPE — each with x, y, width, height, rotation, z-index, visibility, locked.
## 28. Customer experience
EVENT → GET TICKETS → party sizes → CHOOSE SEATS (Find N Together or manual) → per-seat type+price lines → one checkout → payment → QR tickets. Seats-first-then-types also allowed.
## 29. Mobile UX
A dedicated mobile selector (bottom sheet for ticket types), not a shrunken desktop map.
## 30. Enterprise-level requirements
Multiple layouts/sections; unlimited rows; straight/curved/angled/circular/freeform; individual positioning; mixed categories per row; multiple ticket types per seat; adult+child adjacency; family booking; adjacent-seat recommendation; GA; reserved; hybrid; VIP tables; whole-table sales; accessibility; restricted view; comps; promoter/staff allocations; blocking; real-time holds; orphan prevention; dynamic pricing; promo codes; mobile+desktop maps; zoom/pan; row/section generators; copy/mirror; undo/redo; templates; event overrides; real-time inventory; QR generation; multi-currency.
## Non-negotiable engineering rule
Five separate layers, never collapsed into one `seat` object:
1. PHYSICAL LAYOUT — "Where is A10?"
2. SEAT CATEGORY — "Is A10 Standard, Premium or VIP?"
3. TICKET TYPE — "Who will occupy A10?"
4. PRICING — "What does that combination cost?"
5. INVENTORY — "Can A10 currently be purchased?"
From a 100-seat Kinshasa theatre to a 70,000-seat stadium — while an adult paying £10 and their child paying £5 sit side by side in one booking.
