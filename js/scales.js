var baseOctave = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
var guitarStrings = ['E', 'B', 'G', 'D', 'A', 'E'];

var majorScale = [2, 2, 1, 2, 2, 2];
var minorScale = [2, 1, 2, 2, 1, 2];

var createMovedOctave = function (from) {
    from = from.toUpperCase();

    var head = [];
    var tail = [];
    var fromFounded = false;

    for (var i = 0; i < baseOctave.length; i++) {
        var note = baseOctave[i];

        if (note == from) {
            fromFounded = true;
        }

        if (fromFounded) {
            head.push(note);
        } else {
            tail.push(note);
        }
    }

    return head.concat(tail);
};

var createFretNotes = function (from) {
    var scale = createMovedOctave(from);

    return scale.concat(scale, [from]);
}

var createFullFretNotes = function () {
    var matrix = [];

    for (var i = 0; i < guitarStrings.length; i++) {
        matrix.push(createFretNotes(guitarStrings[i]));
    }

    return matrix;
}

var createScale = function (scaleDef, octave) {
    var scale = [octave[0]];

    var idx = 0;

    for (var i = 0; i < scaleDef.length; i++) {
        idx += scaleDef[i];
        scale.push(octave[idx]);
    }

    return scale;
}

var findNotes = function (notes, notesMatrix) {
    var results = [];

    for (var i = 0; i < notesMatrix.length; i++) {
        for (var j = 0; j < notesMatrix[i].length; j++) {
            var note = notesMatrix[i][j];
            if (notes.indexOf(note) > -1)
                results.push({string: i, fret: j});
        }
    }

    return results;
}

/// #region tests


// var testFret = createFullFretNotes();

// var testStr = '';

//for (var i = 0; i < testFret.length; i++) {

//    var testStr = '';

//    for (var j = 0; j < testFret[i].length; j++) {
//        testStr += ' ' + testFret[i][j] + ' ';
//    }

//    console.log(testStr);
//}

// var testScale = createScale(minorScale, createMovedOctave('D'));


//for (var i = 0; i < testScale.length; i++) {
//    testStr += ' ' + testScale[i] + ' ';
//}


// var testNotes = findNotes(testScale, testFret);

// for (var i = 0; i < testNotes.length; i++) {
//     testStr += '{string: ' + testNotes[i].string + ', fret: ' + testNotes[i].fret + '}';
// }

// console.log(testStr);

/// #endregion