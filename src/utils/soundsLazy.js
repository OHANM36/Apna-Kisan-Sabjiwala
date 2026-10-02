// साउंड फ़ाइल (~30KB base64) तभी लोड हो जब सच में बजानी हो — पहले पेज-लोड हल्का रहे।
export function playNewOrderSound() {
  import('./sounds').then((m) => m.playNewOrderSound()).catch(() => {})
}
export function playStatusChangeSound() {
  import('./sounds').then((m) => m.playStatusChangeSound()).catch(() => {})
}
