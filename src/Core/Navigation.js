define([
    './Logger'
], function(Logger) {
    'use strict';
    /**
     * This is the core interface to camera controls and navigation. The active navigation object can normally be obtained from the "navigation" property of the Viewer3D instance. Client implementations should not normally instantiate this class directly.
     *  @class
     *  @param {THREE.Camera} camera - The main camera object used to render the scene.
     *  @constructor
     */
    function Navigation(camera) {
        var kMinFOV = 6.88; // 200 mm
        var kMaxFOV = 100;  // 10 mm
        var kEpsilon = 0.000001;

        this.__options = {
            dollyToPivot: false,
            orbitPastPoles: true,
            reverseDolly: false,
            reverseHorizontalLook: false,
            reverseVerticalLook: false,
            useLeftHandedInput: false,
            usePivotAlways: false,
            lockNavigation: false
        };

        // which actions are allowed when navigation is locked
        this.__lockSettings = {
            orbit: false,
            pan: false,
            zoom: false,
            roll: false,
            fov: false,
            gotoview: false,
            walk: false
        };

        this.__pivotIsSetFlag = false;
        this.__fitToViewRequested = false;
        this.__homeViewRequested = false;
        this.__transitionActive = false;
        this.__destinationView = null;
        this.__is2D = false;
        this.__isTouchDevice = false;
        this.__kEpsilon = kEpsilon;

        var _camera = null;

        var _viewport = { left: 0, top: 0, width: 1, height: 1 };

        this.uninitialize = function () {
            this.setCamera(null);
        };

        /**
         * Set or unset the current camera used for navigation. Normally set via the constructor.
         * The camera should be of type Autodesk.Viewing.UnifiedCamera.
         *  @param {Autodesk.Viewing.UnifiedCamera} camera - the current camera object.
         */
        this.setCamera = function (camera) {
            if (camera !== _camera) {
                _camera = camera;
                if (camera) {
                    if (!camera.hasOwnProperty("target"))
                        camera.target = new THREE.Vector3(0, 0, 0);

                    if (!camera.hasOwnProperty("pivot"))
                        camera.pivot = new THREE.Vector3(0, 0, 0);

                    camera.worldup = camera.up.clone();  // Initial assumption!!
                    camera.dirty = true;
                }
            }
        };

        /**
         *  @returns {THREE.Camera} - the current camera object.
         */
        this.getCamera = function () {
            return _camera;
        };

        /**
         * Set the current canvas viewport in screen coordinates.
         * Invoked internally on canvas resize.
         *  @param {Object} viewport - Rectangle with properties left, top, width, height.
         */
        this.setScreenViewport = function (viewport) {
            _viewport = viewport;
        };

        /**
         * Get the current canvas viewport in screen coordinates.
         *  @returns {Object} with properties left, top, width, height.
         */
        this.getScreenViewport = function () {
            return _viewport;
        };

        this.__setUp = function (up) {
            if (up && _camera) {
                var upCheck = up.clone().normalize();
                var diff = upCheck.sub(_camera.worldup);
                if (diff.lengthSq() !== 0.0) {
                    _camera.worldup.copy(up).normalize();
                    _camera.dirty = true;
                    return true;
                }
            }
            return false;
        };

        this.__getUp = function () {
            return _camera ? _camera.worldup : new THREE.Vector3(0, 1, 0);
        };

        /**
         * Sets the cameras position and view direction.
         *  @param {THREE.Vector3} position - the new position for the camera in world space.
         *  @param {THREE.Vector3} target - the point in world space that the camera should look towards.
         */
        this.setView = function (position, target) {
            if (_camera && position && target) {
                _camera.position.copy(position);
                _camera.target.copy(target);
                _camera.dirty = true;
            }
        };

        /**
         * Orient the camera's up direction with the current world up direction
         */
        this.orientCameraUp = function () {
            if (_camera && this.isActionEnabled('roll')) {
                _camera.up.copy(this.getAlignedUpVector()); // New up aligned with world up
                _camera.dirty = true;
            }
        };

        /**
         *  @returns {THREE.Vector3} the world space position of the pivot point for orbit navigation.
         */
        this.getPivotPoint = function () {
            return _camera ? _camera.pivot.clone() : new THREE.Vector3(0, 0, 0);
        };

        /**
         * Sets the Vector3 world space position of the pivot point for orbit navigation.
         *  @param {THREE.Vector3} pivot - the new pivot position.
         */
        this.setPivotPoint = function (pivot) {
            if (_camera && pivot) {
                _camera.pivot.copy(pivot);
                _camera.dirty = true;
            }
        };

        /**
         *  @returns {THREE.Vector3} the world space position of the camera.
         */
        this.getPosition = function () {
            return _camera ? _camera.position.clone() : new THREE.Vector3(0, 0, 1);
        };

        /**
         * Sets the Vector3 world space position of camera.
         *  @param {THREE.Vector3} pos - the new camera position.
         */
        this.setPosition = function (pos) {
            if (_camera && pos) {
                _camera.position.copy(pos);
                _camera.dirty = true;
            }
        };

        /**
         * Sets the Vector3 world space position towards which the camera should be pointing.
         *  @param {THREE.Vector3} target - the new camera look at point.
         */
        this.setTarget = function (target) {
            if (_camera && target) {
                _camera.target.copy(target);
                _camera.dirty = true;
            }
        };

        /**
         *  @returns {THREE.Vector3} the world space position towards which the camera is pointing.
         */
        this.getTarget = function () {
            return _camera ? _camera.target.clone() : new THREE.Vector3(0, 0, 0);
        };

        /**
         * Get the current camera view vector. This vector is not normalized and its
         * length is the distance between the camera position and the camera look at point.
         *  @returns {THREE.Vector3} the current camera view vector in world space.
         */
        this.getEyeVector = function () {
            return _camera ? _camera.target.clone().sub(_camera.position) : new THREE.Vector3(0, 0, -1);
        };

        /**
         *  @returns {number} the minimum allowed vertical field of view in degrees.
         */
        this.getFovMin = function () {
            return kMinFOV;
        };

        /**
         *  @returns {number} the maximum allowed vertical field of view in degrees.
         */
        this.getFovMax = function () {
            return kMaxFOV;
        };

        /**
         * Returns true if the point is visible.
         *
         * @param {THREE.Vector3} point - The point in world coordinates.
         *
         * @returns {boolean} - True if the point is within the camera's frustum.
         */
        this.isPointVisible = function (point) {
            var cameraFrustum = new THREE.Frustum().setFromMatrix(_camera.projectionMatrix.clone().multiply(_camera.matrixWorldInverse));
            return cameraFrustum.containsPoint(point);
        };

        /**
         * Set the current vertical field of view.
         *  @param {number} fov - the new field of view in degrees (value is clamped to the minimum and maximum field of view values).
         *  @param {boolean} adjustPosition - If true, the camera position will be modified to keep either the world space area
         *                                    of the view at the pivot point unchanged (if it is set and visible) or the world
         *                                    space area of view at the camera look at point unchanged.
         */
        this.setVerticalFov = function (fov, adjustPosition) {
            // If camera is not perspective don't allow fov change
            if (_camera && !_camera.isPerspective)
                return;

            if (fov < kMinFOV) fov = kMinFOV;
            else if (fov > kMaxFOV) fov = kMaxFOV;

            if (_camera && this.isActionEnabled('fov')) {
                if (Math.abs(_camera.fov - fov) <= kEpsilon)
                    return;

                if (adjustPosition) {
                    var usePivot = this.__pivotIsSetFlag && this.isPointVisible(this.getPivotPoint());

                    var pos = this.getPosition();
                    var eye = this.getEyeVector();

                    var oldFOV = THREE.Math.degToRad(_camera.fov);
                    var newFOV = THREE.Math.degToRad(fov);

                    var oldDistance = usePivot ? this.getPivotPlaneDistance() : eye.length();
                    var newDistance = oldDistance * Math.tan(oldFOV * 0.5) / Math.tan(newFOV * 0.5);

                    var delta = eye.normalize().multiplyScalar(oldDistance - newDistance);
                    this.setPosition(pos.add(delta));

                    if (usePivot) {
                        this.setTarget(this.getTarget().add(delta));
                    }
                }
                _camera.setFov(fov);
                _camera.dirty = true;
            }
        };

        /**
         * Compute camera position and look at point which will fit the given bounding box in the view frustum at the given field of view angle.
         *  @param {THREE.Vector3} oldpos - existing camera position
         *  @param {THREE.Vector3} oldcoi - existing camera look at point
         *  @param {number} fov - field of view to use for fit calculation in degrees
         *  @param {THREE.Box3} bounds - bounding box to fit
         *  @returns {Object} Object with properties "position" and "target".
         */
        this.computeFit = function (oldpos, oldcoi, fov, bounds) {
            if (!bounds || bounds.empty())
                return { position: oldpos, target: oldcoi };

            var coi = bounds.center();
            var size = bounds.size();
            var radius = 0.5 * Math.sqrt(size.x * size.x + size.y * size.y + size.z * size.z);
            if (radius === 0.0)
                radius = 1.0;

            if (!this.getIs2D()) {
                // For wide angle views the fit is often too tight because of perspective
                // distortion, so fudge the radius based on the FOV...
                var fovFudge = Math.max(1.0, 0.9 + fov / kMaxFOV * 0.5);
                radius *= fovFudge;
            }
            var eye = oldpos.clone().sub(oldcoi).normalize();
            var fitToViewDistance = radius / Math.tan(THREE.Math.degToRad(fov * 0.5));
            eye.multiplyScalar(fitToViewDistance);

            var pos = coi.clone().add(eye);
            return { position: pos, target: coi };
        };

        /**
         * Compute a vector which is orthogonal to the given view and aligned with the world up direction.
         *  @param {THREE.Vector3} pos - view position
         *  @param {THREE.Vector3} coi - center of interest (view look at point)
         *  @returns {THREE.Vector3} up direction orthogonal to the given view
         */
        this.computeOrthogonalUp = function (pos, coi) {
            var worldUp = this.__getUp();
            var eye = coi.clone().sub(pos);
            if (eye.lengthSq() === 0.0)    // Invalid view?
                return eye.copy(worldUp);

            var right = eye.clone().cross(worldUp);
            if (right.lengthSq() === 0) {
                // If eye and up are colinear, perturb eye
                // to get a valid result:
                if (worldUp.z > worldUp.y)
                    eye.y -= 0.0001;
                else
                    eye.z -= 0.0001;

                right.crossVectors(eye, worldUp);
            }
            return right.cross(eye).normalize();
        };

        /**
         * Causes the current camera position to be changed in order to fit the given bounds into the current view frustum.
         *  @param {boolean} immediate - if false the camera position will animate to the new location.
         *  @param {THREE.Box3} bounds - bounding box to fit
         *  @param {boolean} reorient - if true the camera up direction will be reoriented with the world up.
         *  @returns {Object} Object with properties "position" and "target".
         */
        this.fitBounds = function (immediate, bounds, reorient) {
            var oldcoi = this.getTarget();
            var pos = this.getPosition();

            if (!this.isActionEnabled('gotoview') || !bounds || bounds.empty())
                return { position: pos, target: oldcoi };

            var fov = this.getVerticalFov();
            var fit = this.computeFit(pos, oldcoi, fov, bounds);
            var up = reorient ? this.computeOrthogonalUp(pos, oldcoi) : _camera.up;

            if (immediate) {
                _camera.up.copy(up);
                this.setView(fit.position, fit.target);
            }
            else {
                this.setRequestTransitionWithUp(true, fit.position, fit.target, fov, up);
            }
            this.setPivotPoint(fit.target);
            this.setPivotSetFlag(true);

            return fit;
        };


        /**
         * Update the current camera projection matrix and orient the camera to the current look at point.
         * Invoked internally prior to rendering a new frame with the current camera.
         */
        this.updateCamera = function () {
            if (_camera) {
                _camera.updateProjectionMatrix();
                this.orient(_camera, _camera.target, _camera.position, _camera.up);
                _camera.dirty = false;
            }
        };

        this.setCamera(camera);
    };

    Navigation.prototype.constructor = Navigation;


    Navigation.prototype.setIs2D = function (state) {
        this.__is2D = !!state;
    };

    Navigation.prototype.getIs2D = function () {
        return this.__is2D;
    };

    Navigation.prototype.setIsTouchDevice = function (state) {
        this.__isTouchDevice = !!state;
    };

    Navigation.prototype.getIsTouchDevice = function () {
        return this.__isTouchDevice;
    };

    /**
     * Rotate the given object so that its negative Z axis is directed towards the given point in world space. Used internally to orient the camera towards the target look at point. This is a modified version of the Object3D.lookAt method that uses different solution for the singular case when (view X up) == 0.
     *  @method
     *  @param {THREE.Object3D} object - the object to be oriented
     *  @param {THREE.Vector3} target - the world space point to orient towards
     *  @param {THREE.Vector3} from - the world space position of the object being rotated
     *  @param {THREE.Vector3} up - the direction to align the objects Y axis with
     */
    Navigation.prototype.orient = function () {
        var m1;
        var x;
        var y;
        var z;

        function init_three() {
            if (m1)
                return;

            m1 = new THREE.Matrix4();
            x = new THREE.Vector3();
            y = new THREE.Vector3();
            z = new THREE.Vector3();
        }

        return function (object, target, from, up) {
            init_three();

            var te = m1.elements;

            z.subVectors(from, target).normalize();
            if (z.lengthSq() === 0) {
                z.z = 1;
            }
            x.crossVectors(up, z).normalize();
            if (x.lengthSq() === 0) {
                // If Z is up then cross with Y to get X
                // otherwize cross with Z to get X.
                if (up.z > up.y)
                    z.y -= 0.0001;
                else
                    z.z += 0.0001;

                x.crossVectors(up, z).normalize();
            }
            y.crossVectors(z, x);

            te[0] = x.x; te[4] = y.x; te[8] = z.x;
            te[1] = x.y; te[5] = y.y; te[9] = z.y;
            te[2] = x.z; te[6] = y.z; te[10] = z.z;

            object.setRotationFromMatrix(m1);
        };
    }();

    /**
     * Convert a vertical field of view angle in degrees to a 35mm camera focal length value.
     *  @param {number} fov - vertical field of view in degrees
     *  @returns {number} focal length in millimeters
     */
    Navigation.prototype.fov2fl = function (fov) {
        // Note: the size of the 35mm camera back is 36x24mm.  Since we are setting and
        // getting the vertical FOV, we need to use the vertical measurement of 24mm, or
        // rather half of that (12.0) in our calculations.
        var k35mmVerticalCameraBackSize = 12.0;

        // Given a vertical field-of-view, return the focal length in millimeters
        // that it corresponds to in a 35mm film camera.
        var rads = THREE.Math.degToRad(fov);
        if (rads <= 0.0)
            rads = 0.0001;
        return Math.round(k35mmVerticalCameraBackSize / Math.tan(rads * 0.5));
    };

    /**
     * Convert a 35mm camera focal length value to a vertical field of view angle in degrees.
     *  @param {number} fl - focal length in millimeters
     *  @returns {number} vertical field of view in degrees
     */
    Navigation.prototype.fl2fov = function (fl) {
        // Note: the size of the 35mm camera back is 36x24mm.  Since we are setting and
        // getting the vertical FOV, we need to use the vertical measurement of 24mm, or
        // rather half of that (12.0) in our calculations.
        var k35mmVerticalCameraBackSize = 12.0;

        // Given a focal length, return the vertical field of view that
        // this would correspond to in a 35mm camera.
        if (fl <= 0)
            fl = 0.0001;

        var rads = 2.0 * Math.atan(k35mmVerticalCameraBackSize / fl);
        return THREE.Math.radToDeg(rads);
    };

    /**
     * Set the up direction for the camera. The given vector should be orthogonal to the current view direction.
     *  @method
     *  @param {THREE.Vector3} up - the new up direction vector
     */
    Navigation.prototype.setCameraUpVector = function (up) {
        if (this.isActionEnabled('roll')) {
            var camera = this.getCamera();
            camera.up.copy(up);
            camera.dirty = true;
        }
    };

    /**
     * Get the world space vector which is the current cameras up direction.
     *  @method
     *  @returns {THREE.Vector3} the current camera up direction (normalized)
     */
    Navigation.prototype.getCameraUpVector = function () {
        var right = this.getCameraRightVector(false);
        var eye = this.getEyeVector();
        return right.cross(eye).normalize();
    };

    /**
     * Get the world space vector which is the orthogonal to the view direction and aligned with the world up direction.
     *  @method
     *  @returns {THREE.Vector3} the current camera up direction (normalized)
     */
    Navigation.prototype.getAlignedUpVector = function () {
        var right = this.getCameraRightVector(true);
        var eye = this.getEyeVector();
        return right.cross(eye).normalize();
    };

    /**
     * Get the world space vector which is the right side direction of the current camera.
     *  @method
     *  @param {boolean} worldAligned - if true get the right vector aligned with the world up, otherwise use the current camera's up direction.
     *  @returns {THREE.Vector3} the current camera right direction, orthogonal to view and up (normalized)
     */
    Navigation.prototype.getCameraRightVector = function (worldAligned) {
        var right = new THREE.Vector3();
        var up = worldAligned ? this.getWorldUpVector() : this.getCamera().up;
        var eye = this.getEyeVector();
        right.crossVectors(eye, up);
        if (right.lengthSq() === 0) {
            // If eye and up are colinear, perturb eye
            // to get a valid result:
            if (up.z > up.y)
                eye.y -= 0.0001;
            else
                eye.z += 0.0001;

            right.crossVectors(eye, up);
        }
        return right.normalize();
    };

    /**
     * Change the current world up direction.
     *  @param {THREE.Vector3} up - the new world up direction
     *  @param {boolean} reorient - if true, make sure the camera up is oriented towards the world up direction.
     */
    Navigation.prototype.setWorldUpVector = function (up, reorient) {
        if (this.isActionEnabled('roll')) {
            this.__setUp(up);

            if (reorient)
                this.orientCameraUp();
        }
    };

    /**
     * Get the current world up direction.
     *  @returns {THREE.Vector3} the current world up direction (normalized)
     */
    Navigation.prototype.getWorldUpVector = function () {
        return this.__getUp().clone();
    };

    /**
     * Compute a world right direction based on the current world up direction. This will return the normalized cross product of the current up direction with one of the major axes to provide a usable world right direction.
     *  @method
     *  @returns {THREE.Vector3} the computed world right direction
     */
    Navigation.prototype.getWorldRightVector = function () {
        var right = new THREE.Vector3();
        right.copy(this.__getUp());

        if (Math.abs(right.z) <= Math.abs(right.y)) {
            // Cross(Vertical, ZAxis)
            right.set(right.y, -right.x, 0);
        }
        else if (right.z >= 0) {
            // Cross(YAxis, Vertical)
            right.set(right.z, 0, -right.x);
        }
        else {
            // Cross(Vertical, YAxis)
            right.set(-right.z, 0, right.x);
        }
        return right.normalize();
    };

    /**
     *  @returns {number} the current camera vertical field of view in degrees
     */
    Navigation.prototype.getVerticalFov = function () {
        return this.getCamera().fov;
    };

    /**
     *  @returns {number} the current camera horizontal field of view in degrees
     */
    Navigation.prototype.getHorizontalFov = function () {
        var viewport = this.getScreenViewport();
        return this.getCamera().fov * (viewport.width / viewport.height);
    };

    /**
     *  @returns {number} the current camera focal length based on a 35mm camera lens model
     */
    Navigation.prototype.getFocalLength = function () {
        return this.fov2fl(this.getVerticalFov());
    };

    /**
     * Set the current cameras field of view using a 35mm camera focal length value
     *  @param {number} millimeters - focal length in millimeters
     *  @param {boolean} adjustPosition - If true, the camera position will be modified to keep either the world space area
     *                                    of the view at the pivot point unchanged (if it is set and visible) or the world
     *                                    space area of view at the camera look at point unchanged.
     */
    Navigation.prototype.setFocalLength = function (millimeters, adjustPosition) {
        this.setVerticalFov(this.fl2fov(millimeters), adjustPosition);
    };

    /**
     * Set or unset a view navigation option to reverse the default direction for camera dolly (zoom) operations.
     *  @param {boolean} state - value of the option, true for reverse, false for default
     */
    Navigation.prototype.setReverseZoomDirection = function (state) {
        this.__options.reverseDolly = !!state;
    };

    /**
     * Set or unset a view navigation option to reverse the default direction for horizontal look operations.
     *
     * Not applicable to 2D.
     *
     *  @param {boolean} state - value of the option, true for reverse, false for default
     */
    Navigation.prototype.setReverseHorizontalLookDirection = function (state) {
        if (this.getIs2D()) {
            Logger.warn("Autodesk.Viewing.Navigation.setReverseHorizontalLookDirection is not applicable to 2D");
            return;
        }

        this.__options.reverseHorizontalLookDirection = !!state;
    };

    /**
     * Set or unset a view navigation option to reverse the default direction for vertical look operations.
     *
     * Not applicable to 2D.
     *
     *  @param {boolean} state - value of the option, true for reverse, false for default
     */
    Navigation.prototype.setReverseVerticalLookDirection = function (state) {
        if (this.getIs2D()) {
            Logger.warn("Autodesk.Viewing.Navigation.setReverseVerticalLookDirection is not applicable to 2D");
            return;
        }

        this.__options.reverseVerticalLookDirection = !!state;
    };

    /**
     * Get the state of the view navigation option which requests the reversal of the default direction for camera dolly (zoom) operations.
     *  @returns {boolean} - value of the option, true for reverse, false for default
     */
    Navigation.prototype.getReverseZoomDirection = function () {
        return this.__options.reverseDolly;
    };

    /**
     * Get the state of the view navigation option which requests the reversal of the default horizontal look direction
     *
     * Not applicable to 2D.
     *
     *  @returns {boolean} value of the option, true for reverse, false for default
     */
    Navigation.prototype.getReverseHorizontalLookDirection = function () {
        if (this.getIs2D()) {
            Logger.warn("Autodesk.Viewing.Navigation.getReverseHorizontalLookDirection is not applicable to 2D");
            return false;
        }

        return this.__options.reverseHorizontalLookDirection;
    };

    /**
     * Get the state of the view navigation option which requests the reversal of the default vertical look direction
     *
     * Not applicable to 2D.
     *
     *  @returns {boolean} value of the option, true for reverse, false for default
     */
    Navigation.prototype.getReverseVerticalLookDirection = function () {
        if (this.getIs2D()) {
            Logger.warn("Autodesk.Viewing.Navigation.getReverseVerticalLookDirection is not applicable to 2D");
            return false;
        }

        return this.__options.reverseVerticalLookDirection;
    };

    /**
     * Set or unset a view navigation option to request the default direction for camera dolly (zoom) operations to be towards the camera pivot point. If unset the default direction would normally be towards the cursor position.
     *  @param {boolean} state - value of the option, true for towards the pivot, false for default
     */
    Navigation.prototype.setZoomTowardsPivot = function (state) {
        this.__options.dollyToPivot = !!state;
    };

    /**
     * Get the state of the view navigation option that requests the default direction for camera dolly (zoom) operations to be towards the camera pivot point.
     *  @returns {boolean} - value of the option, true for towards the pivot, false for default
     */
    Navigation.prototype.getZoomTowardsPivot = function () {
        return this.__options.dollyToPivot;
    };

    /**
     * Set or unset a view navigation option to allow the orbit controls to move the camera beyond the north and south poles (world up/down direction). In other words, when set the orbit control will allow the camera to rotate into an upside down orientation. When unset orbit navigation should stop when the camera view direction reaches the up/down direction.
     *
     * Not applicable to 2D.
     *
     *  @param {boolean} state - value of the option, true to allow orbiting past the poles.
     */
    Navigation.prototype.setOrbitPastWorldPoles = function (state) {
        if (this.getIs2D()) {
            Logger.warn("Autodesk.Viewing.Navigation.setOrbitPastWorldPoles is not applicable to 2D");
            return;
        }

        this.__options.orbitPastPoles = !!state;
    };

    /**
     * Get the state of the view navigation option that allows orbit controls to continue past the world up/down direction.
     *
     * Not applicable to 2D.
     *
     *  @returns {boolean} - value of the option, true if orbiting past the poles is allowed.
     */
    Navigation.prototype.getOrbitPastWorldPoles = function () {
        if (this.getIs2D()) {
            Logger.warn("Autodesk.Viewing.Navigation.orbitPastWorldPoles is not applicable to 2D");
            return false;
        }

        return this.__options.orbitPastPoles;
    };

    /**
     * Set or unset a view navigation option which requests that orbit controls always orbit around the currently set pivot point.
     *  @param {boolean} state - value of the option, true to request use of the pivot point. When false some controls may pivot around the center of the view. (Currently applies only to the view-cube orbit controls.)
     */
    Navigation.prototype.setUsePivotAlways = function (state) {
        this.__options.usePivotAlways = !!state;
    };

    /**
     * Get the state of the view navigation option that requests full use of the pivot point.
     *  @returns {boolean} - value of the option, if the pivot should be used as the orbit origin.
     */
    Navigation.prototype.getUsePivotAlways = function () {
        return this.__options.usePivotAlways;
    };

    /**
     * Set or unset a view navigation option which requests that mouse buttons be reversed from their default assignment. i.e. Left mouse operation becomes right mouse and vice versa.
     *  @param {boolean} state - value of the option, true to request reversal of mouse button assignments.
     */
    Navigation.prototype.setUseLeftHandedInput = function (state) {
        this.__options.useLeftHandedInput = !!state;
    };

    /**
     * Get the state of the view navigation option that requests mouse button reversal.
     *  @returns {boolean} - value of the option, true if reversal is requested.
     */
    Navigation.prototype.getUseLeftHandedInput = function () {
        return this.__options.useLeftHandedInput;
    };

    /**
     * Lock or unlock view modification operations.
     * For a more granular control of locked operations, see {@link setLockSettings}.
     *  @param {boolean} state - when true changes to the current camera parameters are not allowed.
     */
    Navigation.prototype.setIsLocked = function (state) {
        this.__options.lockNavigation = !!state;
    };

    /**
     * Get the state of the current view modification lock.
     * For a more granular control of locked operations, see {@link setLockSettings}.
     *  @returns {boolean} - true if view modifications are not currently allowed.
     */
    Navigation.prototype.getIsLocked = function () {
        return this.__options.lockNavigation;
    };

    /**
     * Set the availability of specific camera actions when navigation is locked using {@link setIsLocked}.
     *  @param {object} settings Map of <action>:<bool> pairs specifying whether the given camera
     *  action is *enabled* even when the navigation is locked.
     *  The configurable actions are 'orbit', 'pan', 'zoom', 'roll', 'fov', or 'gotoview'.
     *  By default, none of the camera actions are available when the navigation is locked.
     */
    Navigation.prototype.setLockSettings = function (settings) {
        for (var action in this.__lockSettings) {
            if (settings.hasOwnProperty(action)) {
                this.__lockSettings[action] = settings[action];
            }
        }
    };

    /**
     * Get the availability of specific camera actions when navigation is locked using {@link setIsLocked}.
     *  @returns {object} Map of <action>:<bool> pairs specifying whether the given camera
     *  action is *enabled* even when the navigation is locked.
     */
    Navigation.prototype.getLockSettings = function () {
        var settings = {};
        for (var action in this.__lockSettings) {
            settings[action] = this.__lockSettings[action];
        }
        return settings;
    };

    /**
     * Check the availability of a camera action.
     *  @param {string} action Camera action.
     *  @returns {boolean} True if the camera action is currently enabled.
     */
    Navigation.prototype.isActionEnabled = function (action) {
        return !this.__options.lockNavigation || this.__lockSettings[action] === true;
    };

    /**
     * Set or unset a view navigation option which indicates that the pivot camera parameter is set and can be used for orbit and zoom controls.
     *  @param {boolean} state - value of the option. When not set orbit and zoom operations should occur at the look at position in the center of the current view.
     */
    Navigation.prototype.setPivotSetFlag = function (state) {
        this.__pivotIsSetFlag = !!state;
    };

    /**
     * Get the state of the view navigation option that indicates the pivot is set.
     *  @returns {boolean} - value of the option, true if pivot may be used.
     */
    Navigation.prototype.getPivotSetFlag = function () {
        return this.__pivotIsSetFlag;
    };

    /**
     * Issue a request to change the current cameras view position to fit the active model data into the current view frustum.
     *  @param {boolean} state - value of the requst. Set to true in order to request the change of view.
     */
    Navigation.prototype.setRequestFitToView = function (state) {
        if (this.isActionEnabled('gotoview'))
            this.__fitToViewRequested = !!state;
    };

    /**
     * Get the state of the view navigation option requesting a camera repositioning to fit the active model data. Value will be false if a request has not been made or if having been made has been received and acted upon.
     *  @returns {boolean} - current state of the request.
     */
    Navigation.prototype.getRequestFitToView = function () {
        return this.__fitToViewRequested;
    };

    /**
     * Issue a request to change the current cameras view to the current "home" view. The home view includes position, view direction, world up direction and field of view.
     *  @param {boolean} state - value of the requst. Set to true in order to request the change of view.
     */
    Navigation.prototype.setRequestHomeView = function (state) {
        if (this.isActionEnabled('gotoview'))
            this.__homeViewRequested = !!state;
    };

    /**
     * Get the state of the view navigation option requesting a camera change to the current "home" view. Value will be false if a request has not been made or if having been made has been received and acted upon.
     *  @returns {boolean} - current state of the request.
     */
    Navigation.prototype.getRequestHomeView = function () {
        return this.__homeViewRequested;
    };

    /**
     * Issue a request to transition the current cameras view to that specified by the parameters.
     *  @param {boolean} state - value of the requst. Set to true in order to request the change of view.
     *  @param {THREE.Vector3} pos - the new camera position in world space
     *  @param {THREE.Vector3} coi - the point in world space that the camera should look towards.
     *  @param {number} fov - vertical field of view in degrees
     *  @param {boolean} reorient - set to true to recalculate up vector
     */
    Navigation.prototype.setRequestTransition = function (state, pos, coi, fov, reorient) {
        if (state) {
            this.__destinationView = {
                position: pos.clone(),
                coi: coi.clone(),
                fov: fov,
                up: this.getCamera().up.clone(),
                worldUp: this.getWorldUpVector(),
                reorient: reorient
            };
        }
        else
            this.__destinationView = null;
    };

    /**
     * Issue a request to transition the current cameras view to that specified by the parameters which inlude both the camera up direction and optionally the world up direction.
     *  @param {boolean} state - value of the requst. Set to true in order to request the change of view.
     *  @param {THREE.Vector3} pos - the new camera position in world space
     *  @param {THREE.Vector3} coi - the point in world space that the camera should look towards.
     *  @param {number} fov - vertical field of view in degrees
     *  @param {THREE.Vector3} up -  use this as the target camera up direction
     *  @param {THREE.Vector3} worldUp - (optional) use this as the target world up direction
     */
    Navigation.prototype.setRequestTransitionWithUp = function (state, pos, coi, fov, up, worldUp) {
        if (state) {
            this.__destinationView = {
                position: pos.clone(),
                coi: coi.clone(),
                fov: fov,
                up: up.clone(),
                worldUp: worldUp ? worldUp : this.getWorldUpVector(),
                reorient: false
            };
        }
        else
            this.__destinationView = null;
    };

    /**
     * Get the state of the view navigation option requesting a camera transition to a new view.
     *  @returns {Object} - If a transition request is active, an object with properties "position" (Vector3), "coi" (Vector3), "fov" (Number), "up" (Vector3), "worldUp" (Vector3), "reorient" (boolean). Returns null when no transition is active.
     *  @see setRequestTransitionWithUp
     */
    Navigation.prototype.getRequestTransition = function () {
        return this.__destinationView;
    };

    /**
     * Set a status indicating that the current camera view is in a transitioning state.
     * Used internally to indicate that a transition is active.
     *  @param {boolean} state - value of the transtion status
     */
    Navigation.prototype.setTransitionActive = function (state) {
        this.__transitionActive = !!state;
    };

    /**
     *  Check the status of a view transition request.
     *  @returns {boolean} - value of the transtion status
     */
    Navigation.prototype.getTransitionActive = function () {
        return this.__transitionActive;
    };

    /**
     *  @param {number} atDistance - Distance from the camera at which to compute the view frustum size.
     *  @returns {THREE.Vector2} The size of the view frustum at this distance from the camera.
     */
    Navigation.prototype.getWorldSize = function (atDistance) {
        var viewport = this.getScreenViewport();
        var aspect = viewport.width / viewport.height;
        var worldHeight = 2.0 * atDistance * Math.tan(THREE.Math.degToRad(this.getCamera().fov * 0.5));
        var worldWidth = worldHeight * aspect;

        return new THREE.Vector2(worldWidth, worldHeight);
    };

    /**
     *  Get a world point from normalized screen coordinates by projecting to the plane at the pivot point.
     *  @param {number} x - Normalized screen X coordinate in [0, 1] range (left == 0)
     *  @param {number} y - Normalized screen Y coordinate in [0, 1] range (top == 0)
     *  @returns {THREE.Vector3} - Point in world space
     */
    Navigation.prototype.getWorldPoint = function (x, y) {
        /*
        var x = (mouseX - this.viewport.left) / this.viewport.width;
        var y = (mouseY - this.viewport.top) / this.viewport.height;
        */
        y = 1.0 - y;    // Invert Y so 0 == bottom and map to [-1, 1]
        x = x * 2.0 - 1.0;
        y = y * 2.0 - 1.0;
        var camera = this.getCamera();
        var clickPoint;

        if (camera.isPerspective) {
            clickPoint = new THREE.Vector3(x, y, 1.0);
            clickPoint = clickPoint.unproject(camera);
        }
        var view = this.getEyeVector();
        var position = this.getPosition();
        var direction, distance;

        if (!camera.isPerspective || isNaN(clickPoint.x)) {
            // Calculate a point based on the view...
            var xysize = this.getWorldSize(view.length());
            var trackX = this.getCameraRightVector(false).multiplyScalar((x * 0.5) * xysize.x);
            var trackY = this.getCameraUpVector().multiplyScalar((y * 0.5) * xysize.y);
            direction = view.clone().add(trackX).add(trackY).normalize();
            // Logger.log("GWP: ALT(" + direction.x.toFixed(3) + ", "+ direction.y.toFixed(3) + ", "+ direction.z.toFixed(3) + ")" + x + ", " + y);
        }
        else {
            direction = clickPoint.sub(position).normalize();
            // Logger.log("GWP: DIR(" + direction.x.toFixed(3) + ", "+ direction.y.toFixed(3) + ", "+ direction.z.toFixed(3) + ")");
        }
        var pivot = this.getPivotPoint();
        var usePivot = this.__pivotIsSetFlag && (this.getIs2D() || (camera.isPerspective && this.isPointVisible(pivot)));
        if (usePivot) {
            var denominator = direction.dot(view);
            distance = (denominator !== 0.0)
                     ? Math.abs(pivot.sub(position).dot(view)) / denominator
                     : pivot.sub(position).length();
        }
        else {
            distance = camera.isPerspective ? (camera.near + camera.far) * 0.5
                                            : camera.orthoScale;
        }
        return direction.multiplyScalar(distance).add(position);
    };

    /**
     * @returns {number} - The perpendicular distance from the camera to the plane containing the pivot point.
     */
    Navigation.prototype.getPivotPlaneDistance = function () {
        var pivot = this.getPivotPoint();
        var view = this.getEyeVector();
        var position = this.getPosition();

        return pivot.sub(position).dot(view.normalize());
    };

    /**
     * Pan the camera a relative distance up/down or left/right.
     *  @param {number} deltaX - Normalized X distance to pan left/right (negative/positive).
     *  @param {number} deltaY - Normalized Y distance to pan down/up (negative/positive).
     *  @param {number} atDistance - Pan distance is scaled by the size of the view frustum at this distance from the camera.
     */
    Navigation.prototype.panRelative = function (deltaX, deltaY, atDistance) {
        if (!this.isActionEnabled('pan')) {
            return;
        }

        var trackSpeed = this.getWorldSize(atDistance);
        var offsetX = deltaX * trackSpeed.x;
        var offsetY = deltaY * trackSpeed.y;

        var trackX = this.getCameraRightVector(false).multiplyScalar(offsetX);
        var trackY = this.getCameraUpVector().multiplyScalar(offsetY);

        var offsetVector = trackX.add(trackY);

        this.setView(this.getPosition().add(offsetVector), this.getTarget().add(offsetVector));
    };

    /**
     * Dolly the camera a distance along the vector from a given point to its current position. The dolly distance is clamped to not go past the point.
     *  @param {number} distance - World space distance to move the camera by.
     *  @param {THREE.Vector3} point - World space position used to define the dolly direction.
     */
    Navigation.prototype.dollyFromPoint = function (distance, point) {
        if (!this.isActionEnabled('zoom') || Math.abs(distance) <= this.__kEpsilon)
            return;

        var position = this.getPosition();
        var dollyVec = point.clone().sub(position);
        var oldLength = dollyVec.length();
        var newLength = oldLength + distance;
        var kMinDistance = this.__kEpsilon * 10;    // ???
        if (newLength < kMinDistance)
            newLength = kMinDistance;

        var scaleFactor = newLength / oldLength;
        if (Math.abs(scaleFactor - 1.0) > this.__kEpsilon) {
            dollyVec.multiplyScalar(scaleFactor);
            dollyVec.set(-dollyVec.x, -dollyVec.y, -dollyVec.z);
            var newPosition = dollyVec.add(point);

            // Compute a new look at point from the new position:
            var viewVec = this.getEyeVector();

            // For ortho cameras we must scale the view vector to actually
            // perform an ortho zoom operation:
            if (!this.getCamera().isPerspective)
                viewVec.multiplyScalar(scaleFactor);

            this.setView(newPosition, viewVec.add(newPosition));
        }
    };

    /**
     *  Change current camera to perspective camera.
     *
     *  Not applicable to 2D.
     */
    Navigation.prototype.toPerspective = function () {
        if (this.getIs2D()) {
            Logger.warn("Autodesk.Viewing.Navigation.toPerspective is not applicable to 2D");
            return;
        }

        var camera = this.getCamera();

        if (!camera.isPerspective) {
            camera.toPerspective();
            camera.dirty = true;
        }
    };

    /**
     *  Change current camera to orthographic camera
     */
    Navigation.prototype.toOrthographic = function () {
        var camera = this.getCamera();

        if (camera.isPerspective) {
            camera.toOrthographic();
            camera.dirty = true;
        }
    };


    Navigation.snapToAxis = function (v) {
        var absv = new THREE.Vector3(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z));

        if (absv.x > absv.y && absv.x > absv.z)
            v.set(v.x > 0 ? 1 : -1, 0, 0);
        else if (absv.y > absv.x && absv.y > absv.z)
            v.set(0, v.y > 0 ? 1 : -1, 0);
        else
            v.set(0, 0, v.z > 0 ? 1 : -1);

        return v;
    };

    return Navigation;
});