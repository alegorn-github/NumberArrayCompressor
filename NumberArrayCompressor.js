/**
 * Компактная сериализация/десериализация массивов целых чисел 1-300
 * 
 * Стратегия:
 * 1. Использовать кодирование Run-length для последовательных чисел
 * 2. Использовать упаковку битов с кодированием диапазона для эффективного хранения (9 бит на число)
 * 3. Использовать прямое кодирование как запасной вариант
 * 4. Выбирать наиболее эффективное представление
 * 5. Использовать base64-подобное кодирование для компактности
 */

class NumberArrayCompressor {
  constructor() {
    // Пользовательский алфавит использующий доступные ASCII-символы
    this.alphabet = (Array.from({length: 126 - 33}, (_, i) => String.fromCharCode(i+33))).filter(char=>!',;'.includes(char)).join('');
    this.base = this.alphabet.length; // 64
  }

  /**
   * Кодировать число в пользовательский base64
   */
  encodeNumber(num) {
    if (num === 0) return this.alphabet[0];
    
    let result = '';
    while (num > 0) {
      result = this.alphabet[num % this.base] + result;
      num = Math.floor(num / this.base);
    }
    return result;
  }

  /**
   * Декодировать из пользовательского base64 в число
   */
  decodeNumber(str) {
    let result = 0;
    for (const char of str) {
      result = result * this.base + this.alphabet.indexOf(char);
    }
    return result;
  }

  /**
   * Метод кодирования Run-length
   */
  encodeRunLength(numbers) {
    if (numbers.length === 0) return '';
    
    const sorted = numbers.sort((a, b) => a - b);
    const runs = [];
    let start = sorted[0];
    let length = 1;
    
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1] + 1) {
        length++;
      } else {
        runs.push([start, length]);
        start = sorted[i];
        length = 1;
      }
    }
    runs.push([start, length]);
    
    let encoded = 'R';
    for (const [start, len] of runs) {
      encoded += this.encodeNumber(start) + ',' + this.encodeNumber(len) + ';';
    }
    
    return encoded;
  }

  /**
   * Упаковка битов с кодированием диапазона
   * Каждое число (1-300) кодируется с помощью 9 бит, затем упаковывается эффективно
   */
  encodeBitPacking(numbers) {
    if (numbers.length === 0) return 'B';
    
    // Создать карту частот для сохранения дубликатов
    const freq = {};
    for (const num of numbers) {
      if (num >= 1 && num <= 300) {
        freq[num] = (freq[num] || 0) + 1;
      }
    }
    
    const entries = Object.entries(freq).map(([num, count]) => [parseInt(num), count]);
    entries.sort((a, b) => a[0] - b[0]); // Сортировка по числу
    
    const bitsPerNumber = 9; // 2^9 = 512 > 300
    const bitsPerCount = 8; // Поддержка до 255 вхождений на число
    
    let bitString = '';
    
    // Кодировать каждую пару (число, количество)
    for (const [num, count] of entries) {
      const numBits = (num - 1).toString(2).padStart(bitsPerNumber, '0'); // диапазон 0-299
      const countBits = Math.min(count, 255).toString(2).padStart(bitsPerCount, '0'); // Ограничить 255
      bitString += numBits + countBits;
    }
    
    // Упаковать биты в base64-кодированные блоки
    const chunks = [];
    for (let i = 0; i < bitString.length; i += 6) { // Обрабатывать по 6 бит для base64
      const chunk = bitString.slice(i, i + 6).padEnd(6, '0');
      const value = parseInt(chunk, 2);
      chunks.push(this.alphabet[value]);
    }
    
    return 'B' + this.encodeNumber(entries.length) + ',' + chunks.join('');
  }

  /**
   * Прямое кодирование (запасной вариант)
   */
  encodeDirect(numbers) {
    const unique = [...numbers].sort((a, b) => a - b);
    let encoded = 'D';
    for (const num of unique) {
      encoded += this.encodeNumber(num) + ',';
    }
    return encoded;
  }


  /**
   * Основная функция сериализации
   */
  serialize(numbers) {
    if (!numbers || numbers.length === 0) return 'E'; // Пустой
    
    const runLength = this.encodeRunLength(numbers);
    const bitPacking = this.encodeBitPacking(numbers);
    const direct = this.encodeDirect(numbers);
    
    const candidates = [direct, runLength, bitPacking];
    return candidates.reduce((shortest, current) => 
      current.length < shortest.length ? current : shortest, 
      candidates[0]
    );
  }

  /**
   * Функция десериализации
   */
  deserialize(encoded) {
    if (!encoded || encoded === 'E') return [];
    
    const method = encoded[0];
    const data = encoded.slice(1);
    
    switch (method) {
      case 'R':
        return this.decodeRunLength(data);
      case 'B':
        return this.decodeBitPacking(data);
      case 'D':
        return this.decodeDirect(data);
      default:
        throw new Error('Invalid encoding method');
    }
  }

  /**
   * Декодирование кодирования Run-length
   */
  decodeRunLength(data) {
    const parts = data.split(';').filter(p => p.length > 0);
    
    const numbers = [];
    for (let part of parts) {
      const runData = part.split(',');
      if (runData.length >= 2) {
        const start = this.decodeNumber(runData[0]);
        const length = this.decodeNumber(runData[1]);
        for (let j = 0; j < length; j++) {
          numbers.push(start + j);
        }
      }
    }
    
    return numbers;
  }

  /**
   * Декодирование упаковки битов с кодированием диапазона
   */
  decodeBitPacking(data) {
    if (!data) return [];
    
    const commaPos = data.indexOf(',');
    if (commaPos === -1) return [];
    
    const countStr = data.slice(0, commaPos);
    const packedData = data.slice(commaPos + 1);
    const entryCount = this.decodeNumber(countStr);
    
    if (entryCount === 0) return [];
    
    // Декодировать base64-блоки обратно в битовую строку
    let bitString = '';
    for (const char of packedData) {
      const value = this.alphabet.indexOf(char);
      if (value !== -1) {
        const binaryStr = value.toString(2).padStart(6, '0');
        bitString += binaryStr;
      }
    }
    
    // Извлечь пары (число, количество) из битовой строки
    const numbers = [];
    const bitsPerNumber = 9;
    const bitsPerCount = 8;
    const bitsPerEntry = bitsPerNumber + bitsPerCount; // 17 бит на запись
    
    for (let i = 0; i < entryCount; i++) {
      const start = i * bitsPerEntry;
      const numEnd = start + bitsPerNumber;
      const countEnd = numEnd + bitsPerCount;
      
      if (countEnd <= bitString.length) {
        const numberBits = bitString.slice(start, numEnd);
        const countBits = bitString.slice(numEnd, countEnd);
        
        const num = parseInt(numberBits, 2) + 1; // Вернуть диапазон 1-300
        const count = parseInt(countBits, 2);
        
        if (num >= 1 && num <= 300 && count > 0) {
          for (let j = 0; j < count; j++) {
            numbers.push(num);
          }
        }
      }
    }
    
    return numbers.sort((a, b) => a - b);
  }

  /**
   * Декодирование прямого кодирования
   */
  decodeDirect(data) {
    const parts = data.split(',').filter(p => p.length > 0);
     
    const numbers = [];
    for (let part of parts) {
      const num = this.decodeNumber(part);
      if (num >= 1 && num <= 300) {
        numbers.push(num);
      }
    }
    
    return numbers;
  }

}

// Тестовый набор
class TestSuite {
  constructor() {
    this.compressor = new NumberArrayCompressor();
  }

  runTest(name, numbers) {
    const original = JSON.stringify(numbers);
    const compressed = this.compressor.serialize(numbers);
    const decompressed = this.compressor.deserialize(compressed);
    
    // Проверить корректность
    const originalSet = [...numbers].sort((a, b) => a - b);
    const decompressedSet = [...decompressed].sort((a, b) => a - b);
    const isCorrect = originalSet.size === decompressedSet.size && 
             originalSet.every((n,i) => n === decompressedSet[i]);
    
    const compressionRatio = ((original.length - compressed.length) / original.length * 100).toFixed(1);
    
    console.log(`\n=== ${name} ===`);
    console.log(`Оригинал: ${original.slice(0, 100)}${original.length > 100 ? '...' : ''}`);
    console.log(`Сжато: ${compressed}`);
    console.log(`Длина оригинала: ${original.length}`);
    console.log(`Длина сжатого: ${compressed.length}`);
    console.log(`Коэффициент сжатия: ${compressionRatio}%`);
    console.log(`Корректно: ${isCorrect}`);
    
    if (!isCorrect) {
      console.log(`Ожидалось: ${originalSet}`);
      console.log(`Получено: ${decompressedSet}`);
    }
    
    return {
      name,
      original: original.length,
      compressed: compressed.length,
      ratio: parseFloat(compressionRatio),
      correct: isCorrect
    };
  }

  generateRandomNumbers(count, min = 1, max = 300) {
    const numbers = [];
    for (let i = 0; i < count; i++) {
      numbers.push(Math.floor(Math.random() * (max - min + 1)) + min);
    }
    return numbers;
  }

  runAllTests() {
    const results = [];
    
    // Простые короткие тесты
    results.push(this.runTest('Пустой массив', []));
    results.push(this.runTest('Одно число', [42]));
    results.push(this.runTest('Два числа', [1, 300]));
    results.push(this.runTest('Последовательные короткие', [1, 2, 3, 4, 5]));
    results.push(this.runTest('Непоследовательные короткие', [1, 5, 10, 50, 100]));
    
    // Случайные тесты
    results.push(this.runTest('Случайные 50 чисел', this.generateRandomNumbers(50)));
    results.push(this.runTest('Случайные 100 чисел', this.generateRandomNumbers(100)));
    results.push(this.runTest('Случайные 500 чисел', this.generateRandomNumbers(500)));
    results.push(this.runTest('Случайные 1000 чисел', this.generateRandomNumbers(1000)));
    
    // Граничные тесты
    results.push(this.runTest('Все однозначные числа', this.generateRandomNumbers(100,1,9)));
    results.push(this.runTest('Все двузначные числа', this.generateRandomNumbers(100,10,90)));
    results.push(this.runTest('Все трехзначные числа', this.generateRandomNumbers(1000,100,300)));
    
    // Каждое число повторяется 3 раза (всего 900)
    const tripleNumbers = [];
    for (let i = 1; i <= 300; i++) {
      tripleNumbers.push(i, i, i);
    }
    results.push(this.runTest('Каждое число по 3 раза (900 всего)', tripleNumbers));
    
    // Последовательные диапазоны
    results.push(this.runTest('Диапазон 1-50', Array.from({length: 50}, (_, i) => i + 1)));
    results.push(this.runTest('Диапазон 100-200', Array.from({length: 101}, (_, i) => i + 100)));
    results.push(this.runTest('Диапазон 250-300', Array.from({length: 51}, (_, i) => i + 250)));
    
    // Сводка
    console.log('\n=== СВОДКА ===');
    const avgCompression = results.reduce((sum, r) => sum + r.ratio, 0) / results.length;
    console.log(`Средний коэффициент сжатия: ${avgCompression.toFixed(1)}%`);
    console.log(`Все тесты пройдены: ${results.every(r => r.correct)}`);
    
    return results;
  }
}

// Экспорт для использования
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NumberArrayCompressor, TestSuite };
} else {
  // Для браузера/прямого запуска
  window.NumberArrayCompressor = NumberArrayCompressor;
  window.TestSuite = TestSuite;
}

// Запуск тестов при прямом выполнении файла
if (typeof require !== 'undefined' && require.main === module) {
  const testSuite = new TestSuite();
  testSuite.runAllTests();
}
