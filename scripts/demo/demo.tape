# The README demonstration of pi-495, played by scripts/demo/record.sh, which sets DEMO_CIBLE, the Pi
# agent directory and the 495 data directory. The run itself takes minutes: the recording is hidden
# while 495 works and shown again once the change is closed.

Require pi

Set Shell "bash"
Set FontSize 16
Set Width 1400
Set Height 1000
Set Padding 20
Set TypingSpeed 35ms

Hide
Type 'cd "$DEMO_CIBLE" && clear && pi --no-session'
Enter
Sleep 6s
Show
Sleep 2s

# Pi completes /495 subcommands as they are typed: Escape closes the completion list before Enter.
Type "/495 start add freeMinutes(busy) beside freeSlots: it returns how many minutes of the day no busy slot covers"
Sleep 500ms
Escape
Enter
Sleep 25s

Hide
Wait+Screen@20m /495 closed\/|blocked/
Show
Sleep 2s

Type "/495 status"
Sleep 500ms
Escape
Enter
Sleep 7s

Type "/495 review"
Sleep 500ms
Escape
Enter
Sleep 3s
Down
Sleep 1s
Enter
Sleep 4s
Type "n"
Sleep 5s
Type "q"
Sleep 1s
Type "q"
Sleep 1s

Type "/495 report"
Sleep 500ms
Escape
Enter
Sleep 10s
