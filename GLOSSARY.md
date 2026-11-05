# Dice Simulator

A solo, in-browser 3D dice roller for tabletop roleplaying games. Dice are thrown in a simulated tray and the face that comes to rest on top is the result.

## Language

### Dice

**Die**:
A single physical polyhedron in the tray, of one Die Type.
_Avoid_: Dice (as singular), token

**Die Type**:
The kind of die, named by its number of faces: d4, d6, d8, d10, d12, d20, or d100.
_Avoid_: Die size, sides

**Face Value**:
The number a Die shows once it has come to rest, read from its uppermost face.
_Avoid_: Pip, side

**Tens Die**:
The d10 of a d100 pair that is marked 00–90 and gives the tens digit.
_Avoid_: Percentile die (ambiguous)

**Units Die**:
The d10 of a d100 pair that is marked 0–9 and gives the ones digit; 00 with 0 reads as 100.
_Avoid_: Ones die

**Cocked**:
A Die that has come to rest with no face clearly uppermost, so it has no Face Value until it is re-thrown.
_Avoid_: Stuck, invalid

**Tray**:
The walled area the dice are thrown into and come to rest in.
_Avoid_: Table, board, arena

**Hand**:
The dice gathered at the near edge of the Tray, waiting to be thrown together.
_Avoid_: Pool, staging area, queue

### Rolling

**Roll**:
One complete request to throw dice and produce a Total, from pressing Roll to every Die settling.
_Avoid_: Throw (as a noun for the whole request), toss

**Dice Notation**:
The text form of a Roll, such as `2d6+3` or `4d6dl1`.
_Avoid_: Formula, expression, command

**Modifier**:
A flat number added to or subtracted from a Roll's Total.
_Avoid_: Bonus, adjustment

**Keep / Drop**:
Counting only the highest or lowest N Face Values of a group toward the Total; dice that don't count are Dropped.
_Avoid_: Discard, ignore

**Explode**:
When a Die shows its maximum value, an extra Die of the same type is thrown and its value is added.
_Avoid_: Ace, bonus die

**Re-roll**:
Throwing a Die again because its Face Value met a condition; the old value is discarded.
_Avoid_: Reroll (no hyphen), retry

**Success**:
A Face Value that meets a target condition and counts as 1 toward the Total, instead of being added as a number.
_Avoid_: Hit

**Failure**:
A Face Value meeting a failure condition that subtracts 1 from a success-counting Total.
_Avoid_: Miss, botch

**Breakdown**:
The per-die listing of a Roll showing each Face Value, which were Dropped, and the Modifiers.
_Avoid_: Details, log line

**History**:
The list of past Rolls in the current session.
_Avoid_: Log, feed

**Total**:
The final number a Roll produces after keeping, dropping and Modifiers are applied.
_Avoid_: Sum, score
