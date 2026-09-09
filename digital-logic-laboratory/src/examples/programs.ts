export const programs: Record<string, string> = {
  Addition: `; Inspect an addition, from instruction to NAND.\nLDI R1, 23\nLDI R2, 35\nADD R1, R2\nHALT`,
  "Sum 1…10": `; R1 = 1 + 2 + … + 10\nLDI R0, 10\nLDI R1, 0\nloop:\n  ADD R1, R0\n  DEC R0\n  JNZ loop\nHALT`,
  Fibonacci: `; The first 12 Fibonacci numbers go into RAM.\nLDI R0, 0\nLDI R1, 1\nLDI R3, 0\nLDI R4, 12\nloop:\n  ST R0, [R3]\n  MOV R2, R1\n  ADD R1, R0\n  MOV R0, R2\n  INC R3\n  DEC R4\n  JNZ loop\nHALT`,
  "Memory fill": `; Fill all 1024 video words with stripes.\nLDI R0, 0xAAAA\nLDI R1, 0xC000\nLDI R2, 1024\nfill:\n  ST R0, [R1]\n  INC R1\n  DEC R2\n  JNZ fill\nHALT`,
  Counter: `; A 16-bit binary counter on the first display row.\nLDI R0, 0\nLDI R1, 0xC000\nloop:\n  ST R0, [R1]\n  INC R0\n  JMP loop`,
  "Moving pixel": `; Move a lit pixel down the display.\nLDI R0, 0x8000\nLDI R1, 0xC004\nLDI R2, 0\nLDI R3, 8\nloop:\n  ST R0, [R1]\n  LDI R4, 80\ndelay:\n  DEC R4\n  JNZ delay\n  ST R2, [R1]\n  ADD R1, R3\n  MOV R5, R1\n  LDI R6, 0xC400\n  SUB R5, R6\n  JNZ loop\n  LDI R1, 0xC004\n  JMP loop`,
  "Bouncing square": `; An 8-pixel square bounces vertically.\nLDI R0, 0x0FF0\nLDI R1, 0xC004\nLDI R2, 8\nLDI R3, 0\nframe:\n  MOV R4, R1\n  LDI R5, 8\ndraw:\n  ST R0, [R4]\n  LDI R6, 8\n  ADD R4, R6\n  DEC R5\n  JNZ draw\n  LDI R5, 120\nwait:\n  DEC R5\n  JNZ wait\n  MOV R4, R1\n  LDI R5, 8\nerase:\n  ST R3, [R4]\n  ADD R4, R6\n  DEC R5\n  JNZ erase\n  ADD R1, R2\n  MOV R4, R1\n  LDI R5, 0xC3C4\n  SUB R4, R5\n  JZ reverse\n  MOV R4, R1\n  LDI R5, 0xC004\n  SUB R4, R5\n  JNZ frame\nreverse:\n  NOT R2\n  INC R2\n  JMP frame`,
  Glyphs: `; H16, written exclusively through video memory.\nLDI R1, 0xC1A3\nLDI R2, glyph\nLDI R3, 7\nLDI R4, 8\nrow:\n  LD R0, [R2]\n  ST R0, [R1]\n  ADD R1, R4\n  INC R2\n  DEC R3\n  JNZ row\nHALT\nglyph:\n.word 0xA4E0, 0xACE0, 0xE880, 0xACE0, 0xAAE0, 0xAAE0, 0xA4E0`,
};
const plot = `
; XOR one pixel. R0 = x, R1 = y. Preserve R0…R6.
plot:
 PUSH R0
 PUSH R1
 PUSH R2
 PUSH R3
 PUSH R4
 PUSH R5
 LDI R2, 0
 LDI R3, 16
word_index:
 MOV R4, R0
 SUB R4, R3
 JC next_word
 JMP have_word
next_word:
 MOV R0, R4
 INC R2
 JMP word_index
have_word:
 LDI R3, masks
 ADD R3, R0
 LD R4, [R3]
 ADD R1, R1
 ADD R1, R1
 ADD R1, R1
 ADD R1, R2
 LDI R3, 0xC000
 ADD R1, R3
 LD R5, [R1]
 XOR R5, R4
 ST R5, [R1]
 POP R5
 POP R4
 POP R3
 POP R2
 POP R1
 POP R0
 RET
masks:
 .word 0x8000,0x4000,0x2000,0x1000,0x0800,0x0400,0x0200,0x0100
 .word 0x0080,0x0040,0x0020,0x0010,0x0008,0x0004,0x0002,0x0001
`;
programs.Pong = `; H16 PONG · ↑ / ↓ to move the left paddle.
; Right paddle tracks the ball. Scores are bars along the top.
; RAM: 0=x, 1=y, 2=dx, 3=dy, 4=left, 5=right, 6/7=scores.
; Every game rule and every pixel write executes on H16.
 LDI R0, 64
 LDI R7, 0
 ST R0, [R7]
 INC R7
 ST R0, [R7]
 LDI R0, 1
 INC R7
 ST R0, [R7]
 INC R7
 ST R0, [R7]
 LDI R0, 55
 INC R7
 ST R0, [R7]
 INC R7
 ST R0, [R7]
 CALL sprites
frame:
 CALL sprites
; Human input through memory-mapped keyboard.
 LDI R7, 0xE001
 LD R0, [R7]
 LDI R1, 0
 SUB R0, R1
 JZ ai
 LDI R7, 0xE000
 LD R0, [R7]
 LDI R1, 38
 SUB R0, R1
 JZ up
 LDI R7, 0xE000
 LD R0, [R7]
 LDI R1, 40
 SUB R0, R1
 JNZ ai
 LDI R7, 4
 LD R0, [R7]
 LDI R1, 109
 SUB R1, R0
 JC paddle_down
 JMP ai
paddle_down:
 INC R0
 INC R0
 ST R0, [R7]
 JMP ai
up:
 LDI R7, 4
 LD R0, [R7]
 LDI R1, 11
 SUB R1, R0
 JC ai
 DEC R0
 DEC R0
 ST R0, [R7]
ai:
 LDI R7, 1
 LD R0, [R7]
 LDI R7, 5
 LD R1, [R7]
 MOV R2, R1
 LDI R3, 7
 ADD R2, R3
 SUB R2, R0
 JC ai_up
 LDI R2, 110
 SUB R2, R1
 JZ move
 INC R1
 ST R1, [R7]
 JMP move
ai_up:
 LDI R2, 10
 SUB R2, R1
 JC move
 DEC R1
 ST R1, [R7]
move:
 LDI R7, 0
 LD R0, [R7]
 LDI R7, 2
 LD R1, [R7]
 ADD R0, R1
 LDI R7, 0
 ST R0, [R7]
 LDI R7, 1
 LD R0, [R7]
 LDI R7, 3
 LD R1, [R7]
 ADD R0, R1
 LDI R7, 1
 ST R0, [R7]
 LDI R2, 10
 SUB R2, R0
 JZ bounce_y
 LDI R2, 124
 SUB R2, R0
 JNZ collide
bounce_y:
 LDI R7, 3
 NOT R1
 INC R1
 ST R1, [R7]
collide:
 LDI R7, 0
 LD R0, [R7]
 LDI R1, 6
 SUB R1, R0
 JZ left_collision
 LDI R1, 120
 SUB R1, R0
 JZ right_collision
 JMP score_check
left_collision:
 LDI R7, 4
 JMP paddle_collision
right_collision:
 LDI R7, 5
paddle_collision:
 LD R1, [R7]
 LDI R7, 1
 LD R0, [R7]
 SUB R0, R1
 JC below_top
 JMP score_check
below_top:
 LDI R1, 14
 SUB R1, R0
 JC bounce_x
 JMP score_check
bounce_x:
 LDI R7, 2
 LD R0, [R7]
 NOT R0
 INC R0
 ST R0, [R7]
score_check:
 LDI R7, 0
 LD R0, [R7]
 LDI R1, 1
 SUB R1, R0
 JZ right_scores
 LDI R1, 126
 SUB R1, R0
 JZ left_scores
 JMP render
right_scores:
 LDI R7, 7
 JMP score
left_scores:
 LDI R7, 6
score:
 LD R0, [R7]
 INC R0
 LDI R1, 15
 AND R0, R1
 ST R0, [R7]
; Write two binary score bars to the top of the framebuffer.
 LDI R7, 6
 LD R0, [R7]
 LDI R1, 0xC023
 ST R0, [R1]
 LDI R7, 7
 LD R0, [R7]
 LDI R1, 0xC024
 ST R0, [R1]
 LDI R0, 64
 LDI R7, 0
 ST R0, [R7]
 INC R7
 ST R0, [R7]
render:
 CALL sprites
 JMP frame
; XOR sprites once to draw, again to erase.
sprites:
 PUSH R6
 PUSH R7
 LDI R7, 0
 LD R0, [R7]
 INC R7
 LD R1, [R7]
 CALL plot
 INC R0
 CALL plot
 INC R1
 CALL plot
 DEC R0
 CALL plot
 LDI R0, 4
 LDI R7, 4
 LD R1, [R7]
 CALL paddle
 LDI R0, 123
 LDI R7, 5
 LD R1, [R7]
 CALL paddle
 POP R7
 POP R6
 RET
paddle:
 LDI R6, 14
paddle_pixel:
 CALL plot
 INC R1
 DEC R6
 JNZ paddle_pixel
 RET
${plot}`;
