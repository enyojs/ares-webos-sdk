/*jshint node: true, strict: false, globalstrict: false */

(function () {

    var cliControl = {};
    
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = cliControl;
    }

    cliControl.end =  function(msg) {
        var draining = 0;
        var exit = function() { if (!(draining--)) process.exit(); }
        var streams = [process.stdout, process.stderr];
        streams.forEach(function(stream) {
                draining += 1;
                stream.write('', exit);
        });
        exit();
    };

}());
