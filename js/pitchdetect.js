/*
The MIT License (MIT)

Copyright (c) 2014 Chris Wilson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

window.AudioContext = window.AudioContext || window.webkitAudioContext;

var audioContext = new AudioContext();
var isPlaying = false;
var sourceNode = null;
var analyser = null;
var samplesCount = 1024;
var bufferIterations = 0;
var bufferSize = Math.pow(2,14);
var processorNode = audioContext.createScriptProcessor(samplesCount, 1, 1);
var theBuffer = null;
var DEBUGCANVAS = null;
	var offset = 0;
var detectorElem, 
	canvasElem,
	waveCanvas,
	pitchElem,
	noteElem,
	detuneElem,
	detuneAmount,
	detectionMode,
	detectionModeElem;

var mediaStreamSource;

detectionMode = 'ac';

var bufferedData = new Float32Array(bufferSize*2);
var currentData = new Float32Array(bufferSize);
var calculated = new Float32Array(bufferSize);
var readingOffset = 0;
var writingOffset1 = 0;
var writingOffset2 = -1;
var initBuffer = true;
var lastStep = false;

// FFTW test
// var initFft = Module.cwrap('initFft', 'number', ['number']);
// var calculateFft = Module.cwrap('calculateFft', 'number', ['number']);
// var clearFft = Module.cwrap('clearFft', 'number', []);

// open tuner (kiss fft+autocorr)
var initOTuner = Module.cwrap('init', 'number', ['number']);
var getPitchFromNewBuffer = Module.cwrap('GetPitchFromNewBuffer', 'number', ['number', 'number', 'number']);

//var startTime, stopTime;
var data = new complex_array.ComplexArray(bufferSize);

processorNode.onaudioprocess = function(e) {

	var channelData = e.inputBuffer.getChannelData(0);
	var outputData = e.outputBuffer.getChannelData(0);

	//console.log('reading offset: ' + readingOffset + ', writing offsets: ' + writingOffset1 + '; ' + writingOffset2);
	//pierwsze napelnienie poczatkowej czesci 
	if(readingOffset == 0 && writingOffset1 < bufferSize && initBuffer) {
		for(var i = 0; i<samplesCount; i++){
			bufferedData[writingOffset1+i] = channelData[i];
		}
		writingOffset1 += samplesCount;
	} 

	else if(readingOffset >= bufferSize) {
		writingOffset1 = bufferSize - samplesCount;
		readingOffset = 0;
		writingOffset2 = -1;
		initBuffer = false;
		lastStep = true;
		for(var i = 0; i<samplesCount; i++){
			bufferedData[writingOffset1+i] = channelData[i];
		}
	} else {
		readingOffset += samplesCount;

		if(writingOffset2 < 0 && ((!lastStep && writingOffset1 >= bufferSize + samplesCount) || (lastStep && writingOffset1 >= bufferSize)))
			writingOffset2 = 0;

		if(writingOffset2 >= 0) {
			for(var i = 0; i<samplesCount; i++){
				bufferedData[writingOffset1+i] = bufferedData[writingOffset2+i] = channelData[i];
			}
			writingOffset2 += samplesCount;
		} else {
			for(var i = 0; i<samplesCount; i++){
				bufferedData[writingOffset1+i] = channelData[i];
			}
		}
		writingOffset1 += samplesCount;
		
	}


	// TODO: asynchroniczne wywolanie przez setTimeout
	setTimeout(function() {
		for(var i = 0; i<bufferSize; i++){
			currentData[i] = bufferedData[readingOffset+i]*1000;
		}

		var startTime = Date.now();

		dataHeap.set(new Uint8Array(currentData.buffer));

		if(detectionMode == 'fft2') {
			// Call function and get result
			calculateFft(dataHeap.byteOffset);
			var result = new Float32Array(dataHeap.buffer, dataHeap.byteOffset, calculated.length);
			for(var w = 0; w < bufferSize; w++)
				calculated[w] = Math.abs(result[w]);

		} else if(detectionMode == 'fft3') {
			// pitchDataHeap.set(0);
			// volDataHeap.set(0);
			pitchData[0] = 0;
			pitchDataHeap.set(new Uint8Array(pitchData.buffer));

			var isValid = getPitchFromNewBuffer(dataHeap.byteOffset, pitchDataHeap.byteOffset, 0);

			if(isValid) {
				//console.log(Module.getValue(pitchDataPtr, '*'));
				var pitchResult = new Float32Array(pitchDataHeap.buffer, pitchDataHeap.byteOffset, 1);
				console.log(pitchResult);
				console.log('ok');
			}
			else {
				console.log('not valid');
			}
		}

		var stopTime = Date.now();

		console.log(stopTime - startTime);

		//peaks = getPeaks(calculated);
		
		// Use the in-place mapper to populate the data.
		// data.map(function(value, i, n) {
		//   value.real = bufferedData[readingOffset+i];
		// })
		// var frequencies = data.FFT();
		// frequencies.map(function(frequency, i, n) {
		//   calculated[i] = Math.abs(frequency.real)*32;
		// })

		// var stopTime = Date.now();
		// console.log(stopTime - startTime);

		// var peaks = getPeaks(calculated);
		// console.log(peaks);

		// for(var p in fullFretNotes) {
		// 	if(isEvent(p, calculated[p], peaks)) {
		// 		console.log(fullFretNotes[p]);
		// 		noteElem.innerHTML = fullFretNotes[p];
		// 	}
		// }
	}, 1);
};

var nDataBytes;
var dataPtr;
var dataHeap;

function initFftStuff() {
	initFft(bufferSize);

	// Get data byte size, allocate memory on Emscripten heap, and get pointer
	nDataBytes = currentData.length * currentData.BYTES_PER_ELEMENT;
	dataPtr = Module._malloc(nDataBytes);

	// Copy data to Emscripten heap (directly accessed from Module.HEAPU8)
	dataHeap = new Uint8Array(Module.HEAPU8.buffer, dataPtr, nDataBytes);
	
}

function clearFftStuff() {
	// Free memory
	Module._free(dataHeap.byteOffset);

}

var pitchDataPtr;
var pitchDataHeap;
var volDataPtr;
var volDataHeap;
var pitchData = new Float32Array(1);
pitchData[0] = 0;

function initOTunerStuff() {
	initOTuner(bufferSize);

	// Get data byte size, allocate memory on Emscripten heap, and get pointer
	nDataBytes = currentData.length * currentData.BYTES_PER_ELEMENT;
	dataPtr = Module._malloc(nDataBytes);

	// Copy data to Emscripten heap (directly accessed from Module.HEAPU8)
	dataHeap = new Uint8Array(Module.HEAPU8.buffer, dataPtr, nDataBytes);

	pitchDataPtr = Module._malloc(pitchData.BYTES_PER_ELEMENT);
	//pitchDataPtr = Module.allocate([0], 'float', ALLOC_STACK);
	pitchDataHeap = new Uint8Array(Module.HEAPU8.buffer, pitchDataPtr, 32);

	volDataPtr = Module.allocate([0], 'float', ALLOC_STACK);
	//volDataHeap = new Uint8Array(Module.HEAPU8.buffer, volDataPtr, 32);
}

window.onload = function() {
	var request = new XMLHttpRequest();
	//request.open("GET", "./sounds/440Hz-A.ogg", true);
	//request.open("GET", "./sounds/track1.wav", true);
	request.open("GET", "./sounds/82Hz-E.ogg", true);
	request.responseType = "arraybuffer";
	request.onload = function() {
	  audioContext.decodeAudioData( request.response, function(buffer) { 
	    	theBuffer = buffer;
		} );
	}
	request.send();

	detectorElem = document.getElementById( "detector" );
	canvasElem = document.getElementById( "output" );
	DEBUGCANVAS = document.getElementById( "waveform" );
	if (DEBUGCANVAS) {
		waveCanvas = DEBUGCANVAS.getContext("2d");
		waveCanvas.strokeStyle = "black";
		waveCanvas.lineWidth = 1;
	}
	pitchElem = document.getElementById( "pitch" );
	noteElem = document.getElementById( "note" );
	detuneElem = document.getElementById( "detune" );
	detuneAmount = document.getElementById( "detune_amt" );
	//detectionModeElem
	$('input:radio').change(function() {
		var previousMode = detectionMode;
		detectionMode = this.value;
		var stream = mediaStreamSource || sourceNode;
		if(detectionMode == 'fft2' || detectionMode == 'fft3') {
			analyser.disconnect();
			stream.connect(processorNode);
			processorNode.connect( audioContext.destination );
			for (var i = 0; i < buf.length; i++) {
				buf[i] = null;
			};
			if(detectionMode == 'fft2')
				initFftStuff();
			else
				initOTunerStuff();
		} else if(previousMode == 'fft2' || previousMode == 'fft3') {
			processorNode.disconnect();
			stream.connect(analyser);
			audioContext.destination.disconnect();
		}
	});

	detectorElem.ondragenter = function () { 
		this.classList.add("droptarget"); 
		return false; };
	detectorElem.ondragleave = function () { this.classList.remove("droptarget"); return false; };
	detectorElem.ondrop = function (e) {
  		this.classList.remove("droptarget");
  		e.preventDefault();
		theBuffer = null;

	  	var reader = new FileReader();
	  	reader.onload = function (event) {
	  		audioContext.decodeAudioData( event.target.result, function(buffer) {
	    		theBuffer = buffer;
	  		}, function(){alert("error loading!");} ); 

	  	};
	  	reader.onerror = function (event) {
	  		alert("Error: " + reader.error );
		};
	  	reader.readAsArrayBuffer(e.dataTransfer.files[0]);
	  	return false;
	};



}

function error() {
    alert('Stream generation failed.');
}

function getUserMedia(dictionary, callback) {
    try {
        navigator.getUserMedia = 
        	navigator.getUserMedia ||
        	navigator.webkitGetUserMedia ||
        	navigator.mozGetUserMedia;
        navigator.getUserMedia(dictionary, callback, error);
    } catch (e) {
        alert('getUserMedia threw exception :' + e);
    }
}

function gotStream(stream) {
    // Create an AudioNode from the stream.
    mediaStreamSource = audioContext.createMediaStreamSource(stream);

    // Connect it to the destination.
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    mediaStreamSource.connect( analyser );
    updatePitch();
}

function toggleOscillator() {
    if (isPlaying) {
        //stop playing and return
        sourceNode.stop( now );
        sourceNode = null;
        analyser = null;
        isPlaying = false;
		if (!window.cancelAnimationFrame)
			window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
        window.cancelAnimationFrame( rafID );
        return "play oscillator";
    }
    sourceNode = audioContext.createOscillator();

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    sourceNode.connect( analyser );
    analyser.connect( audioContext.destination );
    sourceNode.start(0);
    isPlaying = true;
    isLiveInput = false;
    updatePitch();

    return "stop";
}

function toggleLiveInput() {
    if (isPlaying) {
        //stop playing and return
        sourceNode.stop( now );
        sourceNode = null;
        analyser = null;
        isPlaying = false;
		if (!window.cancelAnimationFrame)
			window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
        window.cancelAnimationFrame( rafID );
    }
    getUserMedia({audio:true}, gotStream);
}

function togglePlayback() {
    var now = audioContext.currentTime;

    if (isPlaying) {
        //stop playing and return
        sourceNode.stop( now );
        sourceNode = null;
        analyser = null;
        isPlaying = false;
		if (!window.cancelAnimationFrame)
			window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
        window.cancelAnimationFrame( rafID );
        return "start";
    }

    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = theBuffer;
    sourceNode.loop = true;

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    sourceNode.connect( analyser );
    analyser.connect( audioContext.destination );
    sourceNode.start( now );
    isPlaying = true;
    isLiveInput = false;
    updatePitch();

    return "stop";
}

var rafID = null;
var tracks = null;
var buflen = 2048;
var buf = new Uint8Array( buflen );
var MINVAL = 134;  // 128 == zero.  MINVAL is the "minimum detected signal" level.

function findNextPositiveZeroCrossing( start ) {
	var i = Math.ceil( start );
	var last_zero = -1;
	// advance until we're zero or negative
	while (i<buflen && (buf[i] > 128 ) )
		i++;
	if (i>=buflen)
		return -1;

	// advance until we're above MINVAL, keeping track of last zero.
	while (i<buflen && ((t=buf[i]) < MINVAL )) {
		if (t >= 128) {
			if (last_zero == -1)
				last_zero = i;
		} else
			last_zero = -1;
		i++;
	}

	// we may have jumped over MINVAL in one sample.
	if (last_zero == -1)
		last_zero = i;

	if (i==buflen)	// We didn't find any more positive zero crossings
		return -1;

	// The first sample might be a zero.  If so, return it.
	if (last_zero == 0)
		return 0;

	// Otherwise, the zero might be between two values, so we need to scale it.

	var t = ( 128 - buf[last_zero-1] ) / (buf[last_zero] - buf[last_zero-1]);
	return last_zero+t;
}

var noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function noteFromPitch( frequency ) {
	var noteNum = 12 * (Math.log( frequency / 440 )/Math.log(2) );
	return Math.round( noteNum ) + 69;
}

function frequencyFromNoteNumber( note ) {
	return 440 * Math.pow(2,(note-69)/12);
}

function centsOffFromPitch( frequency, note ) {
	return Math.floor( 1200 * Math.log( frequency / frequencyFromNoteNumber( note ))/Math.log(2) );
}



function autoCorrelate( buf, sampleRate ) {
	var MIN_SAMPLES = 4;	// corresponds to an 11kHz signal
	var MAX_SAMPLES = 1000; // corresponds to a 44Hz signal
	var SIZE = 1000;
	var best_offset = -1;
	var best_correlation = 0;
	var rms = 0;
	var foundGoodCorrelation = false;

	if (buf.length < (SIZE + MAX_SAMPLES - MIN_SAMPLES))
		return -1;  // Not enough data

	for (var i=0;i<SIZE;i++) {
		var val = (buf[i] - 128)/128;
		rms += val*val;
	}
	rms = Math.sqrt(rms/SIZE);
	if (rms<0.01)
		return -1;

	var lastCorrelation=1;
	for (var offset = MIN_SAMPLES; offset <= MAX_SAMPLES; offset++) {
		var correlation = 0;

		for (var i=0; i<SIZE; i++) {
			correlation += Math.abs(((buf[i] - 128)/128)-((buf[i+offset] - 128)/128));
		}
		correlation = 1 - (correlation/SIZE);
		if ((correlation>0.9) && (correlation > lastCorrelation))
			foundGoodCorrelation = true;
		else if (foundGoodCorrelation) {
			// short-circuit - we found a good correlation, then a bad one, so we'd just be seeing copies from here.
			return sampleRate/best_offset;
		}
		lastCorrelation = correlation;
		if (correlation > best_correlation) {
			best_correlation = correlation;
			best_offset = offset;
		}
	}
	if (best_correlation > 0.01) {
		// console.log("f = " + sampleRate/best_offset + "Hz (rms: " + rms + " confidence: " + best_correlation + ")")
		return sampleRate/best_offset;
	}
	return -1;
//	var best_frequency = sampleRate/best_offset;
}

var GRAPH_LENGTH = 1500;
var EVENT_THRESHOLD = 0.2;
var CLEAR_EVENT_THRESHOLD = 0.1;
var MAX_VALUE = 1000;
var blocked = [];
var STRING_FREQUENCIES = [null, 329.63, 246.94, 196.00, 146.83, 110.00, 82.407];
var HALF_NOTE_STEP = 0.0595;
var SAMPLING_FREQUENCY = 44100;
//var N = 2048;
var N = 16384;

var graphScale = .1;

var fullFret = createFullFretNotes();
var fullFretNotes = {};

for (var i = 0; i < fullFret.length; i++) {
	for (var j = 0; j < fullFret[i].length; j++) {
		fullFretNotes[getSoundPosition(i+1, j)] = fullFret[i][j];
	};
};
console.log(fullFretNotes);
var peaks;
function getPeaks(xRe) {
			var peaks = [];
			var clearpeaks = [];
			for( var x = 0; x < GRAPH_LENGTH; x++){	
				if(x>1 && xRe[x] * graphScale > EVENT_THRESHOLD*MAX_VALUE){
					if( xRe [ x ] > xRe [ x+1 ] && xRe [ x ] > xRe [ x-1 ]){
						peaks.push(x); 
					}
				}
				if(x>1 && xRe[x] * graphScale > CLEAR_EVENT_THRESHOLD*MAX_VALUE){
					if( xRe [ x ] > xRe [ x+1 ] && xRe [ x ] > xRe [ x-1 ]){
						clearpeaks.push(x); 
					}
				}
			}
			
			if(blocked.length > 0){
				var toClear = 0;
				for(var position=0; position < blocked.length; position++){
					if( xRe [blocked[position]] < CLEAR_EVENT_THRESHOLD*MAX_VALUE){
						toClear++;
						//blocked.splice(position, 1);
						
					}
					if(toClear == blocked.length){
						//console.log("odblokowany ");
						//console.log(blocked);
						blocked.splice(0, blocked.length);
					}
				}
				//if(clearpeaks.length==0 || clearpeaks[0]/blocked<0.9 || clearpeaks[0]/blocked > 1.1){
				//	
				//	blocked = -1;
				//}
			}

			return peaks;
}

function isEvent(position, value, peaks ) {
			if( peaks.length==0){ return false; }
			if( peaks[0]/position<0.95 || peaks[0]/position > 1.05){
				return false;
			} 
			if(blocked.indexOf(position) != -1){
				//console.log("blocked "+position);
				return false;
			}
			if( value > EVENT_THRESHOLD * MAX_VALUE ){
				//console.log("zablokowany od:"+Math.floor(position*0.9)+" do:"+Math.ceil(position*1.1));
				for( var i = Math.floor(position*0.9); i < Math.ceil(position*1.1); i++){
					blocked.push(i);
				}
				return true;				
			}
			return false;
		}

function getSoundPosition(string, position){
			var iStringFrequency 	= STRING_FREQUENCIES[string];									// Czestotliwosc struny
			var iSoundFrequency 		= iStringFrequency * Math.pow(1+HALF_NOTE_STEP, position);		// Wyliczamy czestotliwosc dzwieku z ciagu geometrycznego
			var iPosition 			= Math.round( iSoundFrequency / ((SAMPLING_FREQUENCY * 0.5) / (N * 0.5)) );	// Wyliczamy pozycje
			return iPosition;
		}

			// var iE6Pos 	= getSoundPosition(6, 0);
			 var iAPos 	= getSoundPosition(5, 0);
			// var iDPos 	= getSoundPosition(4, 0);
			// var iGPos 	= getSoundPosition(3, 0);
			// var iBPos 	= getSoundPosition(2, 0);
			// var iE1Pos	= getSoundPosition(1, 0);

			// console.log('E6: ' + iE6Pos);
			 console.log('A: ' + iAPos);
			// console.log('D: ' + iDPos);
			// console.log('G: ' + iGPos);
			// console.log('B: ' + iBPos);
			// console.log('E1 ' + iE1Pos);

function updatePitch( time ) {
	var cycles = new Array;
	var ac;

	if(detectionMode == 'ac') {
		var startTime = Date.now();
		analyser.getByteTimeDomainData( buf );
		ac = autoCorrelate( buf, audioContext.sampleRate );
				var stopTime = Date.now();

		console.log(stopTime - startTime);

	 	if (ac == -1) {
	 		detectorElem.className = "vague";
		 	pitchElem.innerText = "--";
			noteElem.innerText = "-";
			detuneElem.className = "";
			detuneAmount.innerText = "--";
	 	} else {
		 	detectorElem.className = "confident";
		 	pitch = ac;
		 	pitchElem.innerText = Math.floor( pitch ) ;
		 	var note =  noteFromPitch( pitch );
			noteElem.innerHTML = noteStrings[note%12];
			var detune = centsOffFromPitch( pitch, note );
			if (detune == 0 ) {
				detuneElem.className = "";
				detuneAmount.innerHTML = "--";
			} else {
				if (detune < 0)
					detuneElem.className = "flat";
				else
					detuneElem.className = "sharp";
				detuneAmount.innerHTML = Math.abs( detune );
			}
		}

	} else if(detectionMode == 'fft2') {
			 		detectorElem.className = "vague";
		 	pitchElem.innerText = "--";
			noteElem.innerText = "-";
			detuneElem.className = "";
			detuneAmount.innerText = "--";
		//analyser.getByteFrequencyData( buf );
		//ac = -1;
		var pks = getPeaks(calculated);
		//console.log(peaks);
		if(pks){
			for(var p in fullFretNotes) {
				if(isEvent(p, calculated[p], pks)) {
					console.log(p);

					noteElem.innerHTML = fullFretNotes[p];
				}
			}
		}
	} else if(detectionMode == 'fft2') {

	}

// 	detectorElem.className = (confidence>50)?"confident":"vague";

	// TODO: Paint confidence meter on canvasElem here.

	if (DEBUGCANVAS) {  // This draws the current waveform, useful for debugging
		waveCanvas.clearRect(0,0,8192,512);
		waveCanvas.strokeStyle = "red";
		waveCanvas.beginPath();
		waveCanvas.moveTo(0,0);
		waveCanvas.lineTo(0, 512);
		waveCanvas.moveTo(128,0);
		waveCanvas.lineTo(128, 512);
		waveCanvas.moveTo(256,0);
		waveCanvas.lineTo(256, 512);
		waveCanvas.moveTo(384,0);
		waveCanvas.lineTo(384, 512);
		waveCanvas.moveTo(512,0);
		waveCanvas.lineTo(512, 512);
		waveCanvas.stroke();
		
		//teoretycznie miejsce gdzie powinien być peak dla A 440Hz
		//163 wzialem z getSoundPosition(1,5) - pierwsza struna, 5 próg
		waveCanvas.strokeStyle = "blue";
		waveCanvas.beginPath();
		waveCanvas.moveTo(163,0);
		waveCanvas.lineTo(163, 512);
		waveCanvas.stroke();
		
		//poziom ktory wywoluje wsadzenie do peakow
		waveCanvas.strokeStyle = "green";
		waveCanvas.beginPath();
		waveCanvas.moveTo(0, 512 - EVENT_THRESHOLD*MAX_VALUE);
		waveCanvas.lineTo(8192, 512 - EVENT_THRESHOLD*MAX_VALUE);
		waveCanvas.stroke();
		
		//po wejsciu do peaku, dopiero spadniecie ponizej tego poziomu odblokuje dana czestotliwosc
		//unikamy dzieki temu "mikrodrgan" (?)
		waveCanvas.strokeStyle = "yellow";
		waveCanvas.beginPath();
		waveCanvas.moveTo(0, 512 - CLEAR_EVENT_THRESHOLD*MAX_VALUE);
		waveCanvas.lineTo(8192, 512 - CLEAR_EVENT_THRESHOLD*MAX_VALUE);
		waveCanvas.stroke();
		
		waveCanvas.strokeStyle = "black";
		waveCanvas.beginPath();
		waveCanvas.moveTo(0,Math.max(buf[0]||(calculated[0]+512), 0));
		for (var i=1;i<512;i++) {
			waveCanvas.lineTo(i,buf[i]||((calculated[i]* (-graphScale) +512)));
		}
		waveCanvas.stroke();
	}



	if (!window.requestAnimationFrame)
		window.requestAnimationFrame = window.webkitRequestAnimationFrame;
	rafID = window.requestAnimationFrame( updatePitch );
}
